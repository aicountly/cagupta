<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Config\Database;
use App\Models\AppointmentModel;
use App\Models\CalendarOAuthTokenModel;
use App\Models\CalendarSyncAccountModel;
use App\Models\CalendarSyncSettingsModel;
use PDO;

/**
 * CalendarSyncService — orchestrates pushing and pulling calendar events
 * between the app's calendar_events table and external providers
 * (Google Calendar, Outlook, Apple iCloud CalDAV).
 *
 * Push is called synchronously from AppointmentController (create / update / delete).
 * Pull is triggered explicitly via the "Sync Now" button or the sync API endpoint.
 */
final class CalendarSyncService
{
    private AppointmentModel $appointments;
    private CalendarOAuthTokenModel $tokens;
    private CalendarSyncAccountModel $accounts;
    private CalendarSyncSettingsModel $settings;
    private PDO $db;

    public function __construct()
    {
        $this->appointments = new AppointmentModel();
        $this->tokens       = new CalendarOAuthTokenModel();
        $this->accounts     = new CalendarSyncAccountModel();
        $this->settings     = new CalendarSyncSettingsModel();
        $this->db           = Database::getConnection();
    }

    // ── Push ──────────────────────────────────────────────────────────────────

    /**
     * Push a newly created appointment to all enabled provider calendars.
     * Writes back the external event IDs into calendar_events.external_event_ids.
     */
    public function pushEvent(int $appointmentId, int $userId): void
    {
        $apt = $this->appointments->find($appointmentId);
        if ($apt === null) {
            return;
        }
        $syncAccounts = $this->accounts->findEnabledByUser($userId);
        if ($syncAccounts === []) {
            return;
        }

        $externalIds = $this->decodeExternalIds($apt['external_event_ids'] ?? '{}');
        $errors      = [];

        foreach ($syncAccounts as $account) {
            $dir = $account['sync_direction'];
            if ($dir === 'pull_only') {
                continue;
            }
            try {
                $extId = $this->pushToProvider($apt, $account);
                if ($extId !== null) {
                    $externalIds[$account['provider'] . ':' . $account['provider_email']] = $extId;
                }
            } catch (\Throwable $e) {
                error_log('[CalendarSync::push] ' . $account['provider'] . ': ' . $e->getMessage());
                $errors[] = $account['provider'];
            }
        }

        $status = $errors === [] ? 'synced' : 'error';
        $this->updateSyncStatus($appointmentId, $externalIds, $status);
    }

    /**
     * Update an existing appointment on all providers where it was previously pushed.
     */
    public function updateEvent(int $appointmentId, int $userId): void
    {
        $apt = $this->appointments->find($appointmentId);
        if ($apt === null) {
            return;
        }
        $externalIds  = $this->decodeExternalIds($apt['external_event_ids'] ?? '{}');
        if ($externalIds === []) {
            // Was never pushed — try a fresh push instead.
            $this->pushEvent($appointmentId, $userId);

            return;
        }

        $syncAccounts = $this->accounts->findEnabledByUser($userId);
        $errors       = [];

        foreach ($syncAccounts as $account) {
            $key = $account['provider'] . ':' . $account['provider_email'];
            if (!isset($externalIds[$key])) {
                continue;
            }
            $dir = $account['sync_direction'];
            if ($dir === 'pull_only') {
                continue;
            }
            try {
                $this->updateOnProvider($apt, $account, (string)$externalIds[$key]);
            } catch (\Throwable $e) {
                error_log('[CalendarSync::update] ' . $account['provider'] . ': ' . $e->getMessage());
                $errors[] = $account['provider'];
            }
        }

        $status = $errors === [] ? 'synced' : 'error';
        $this->updateSyncStatus($appointmentId, $externalIds, $status);
    }

    /**
     * Delete an appointment from all providers where it was previously pushed.
     */
    public function deleteEvent(int $appointmentId, int $userId): void
    {
        $apt = $this->appointments->find($appointmentId);
        if ($apt === null) {
            return;
        }
        $externalIds  = $this->decodeExternalIds($apt['external_event_ids'] ?? '{}');
        if ($externalIds === []) {
            return;
        }

        $syncAccounts = $this->accounts->findAllByUser($userId);

        foreach ($syncAccounts as $account) {
            $key = $account['provider'] . ':' . $account['provider_email'];
            if (!isset($externalIds[$key])) {
                continue;
            }
            try {
                $this->deleteOnProvider($account, (string)$externalIds[$key]);
            } catch (\Throwable $e) {
                error_log('[CalendarSync::delete] ' . $account['provider'] . ': ' . $e->getMessage());
            }
        }
    }

    // ── Pull ──────────────────────────────────────────────────────────────────

    /**
     * Pull events from all enabled pull-capable accounts for a user.
     * Imports new events and detects conflicts based on user settings.
     *
     * @return array{imported: int, conflicts: int, errors: string[]}
     */
    public function pullEvents(int $userId): array
    {
        $syncAccounts = $this->accounts->findEnabledByUser($userId);
        $userSettings = $this->settings->findByUser($userId);
        $imported     = 0;
        $conflicts    = 0;
        $errors       = [];

        foreach ($syncAccounts as $account) {
            $dir = $account['sync_direction'];
            if ($dir === 'push_only') {
                continue;
            }
            $lastSync = $account['last_synced_at']
                ? (string)$account['last_synced_at']
                : null;

            try {
                $remoteEvents = $this->fetchFromProvider($account, $lastSync);
                foreach ($remoteEvents as $remote) {
                    $result = $this->processRemoteEvent($remote, $account, $userId, (string)$userSettings['conflict_resolution']);
                    if ($result === 'imported') {
                        $imported++;
                    } elseif ($result === 'conflict') {
                        $conflicts++;
                    }
                }
                $this->accounts->update((int)$account['id'], ['last_synced_at' => date('Y-m-d H:i:s')]);
            } catch (\Throwable $e) {
                error_log('[CalendarSync::pull] ' . $account['provider'] . ': ' . $e->getMessage());
                $errors[] = $account['provider'] . ': ' . $e->getMessage();
            }
        }

        return ['imported' => $imported, 'conflicts' => $conflicts, 'errors' => $errors];
    }

    // ── Provider dispatch ─────────────────────────────────────────────────────

    /**
     * Push one appointment to one provider calendar. Returns the external event ID.
     *
     * @param array<string, mixed> $apt
     * @param array<string, mixed> $account
     */
    private function pushToProvider(array $apt, array $account): ?string
    {
        $provider = (string)$account['provider'];
        $email    = (string)$account['provider_email'];
        $calId    = (string)$account['calendar_id'];

        switch ($provider) {
            case 'google':
                $token  = GoogleCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                $event  = $this->buildGoogleEvent($apt);
                $result = GoogleCalendarClient::insertEvent($token, $calId, $event);

                return (string)($result['id'] ?? '');

            case 'outlook':
                $token  = OutlookCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                $event  = $this->buildOutlookEvent($apt);
                $result = OutlookCalendarClient::insertEvent($token, $calId, $event);

                return (string)($result['id'] ?? '');

            case 'apple':
                $tokenRow = $this->tokens->findByUserProviderEmail((int)$account['user_id'], 'apple', $email);
                if ($tokenRow === null) {
                    return null;
                }
                $client  = new AppleCalDAVClient($email, (string)$tokenRow['refresh_token']);
                $uid     = 'cagupta-appt-' . $apt['id'];
                $ics     = AppleCalDAVClient::buildIcs($apt);
                $client->putEvent($calId, $uid, $ics);

                return $uid;

            default:
                return null;
        }
    }

    /**
     * @param array<string, mixed> $apt
     * @param array<string, mixed> $account
     */
    private function updateOnProvider(array $apt, array $account, string $externalId): void
    {
        $provider = (string)$account['provider'];
        $email    = (string)$account['provider_email'];
        $calId    = (string)$account['calendar_id'];

        switch ($provider) {
            case 'google':
                $token = GoogleCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                GoogleCalendarClient::patchEvent($token, $calId, $externalId, $this->buildGoogleEvent($apt));
                break;

            case 'outlook':
                $token = OutlookCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                OutlookCalendarClient::patchEvent($token, $calId, $externalId, $this->buildOutlookEvent($apt));
                break;

            case 'apple':
                $tokenRow = $this->tokens->findByUserProviderEmail((int)$account['user_id'], 'apple', $email);
                if ($tokenRow === null) {
                    break;
                }
                $client = new AppleCalDAVClient($email, (string)$tokenRow['refresh_token']);
                $uid    = 'cagupta-appt-' . $apt['id'];
                $client->putEvent($calId, $uid, AppleCalDAVClient::buildIcs($apt));
                break;
        }
    }

    /**
     * @param array<string, mixed> $account
     */
    private function deleteOnProvider(array $account, string $externalId): void
    {
        $provider = (string)$account['provider'];
        $email    = (string)$account['provider_email'];
        $calId    = (string)$account['calendar_id'];

        switch ($provider) {
            case 'google':
                $token = GoogleCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                GoogleCalendarClient::deleteEvent($token, $calId, $externalId);
                break;

            case 'outlook':
                $token = OutlookCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                OutlookCalendarClient::deleteEvent($token, $calId, $externalId);
                break;

            case 'apple':
                $tokenRow = $this->tokens->findByUserProviderEmail((int)$account['user_id'], 'apple', $email);
                if ($tokenRow === null) {
                    break;
                }
                $client   = new AppleCalDAVClient($email, (string)$tokenRow['refresh_token']);
                $eventUrl = rtrim($calId, '/') . '/' . $externalId . '.ics';
                $client->deleteEvent($eventUrl);
                break;
        }
    }

    /**
     * Fetch remote events from one provider account since the last sync.
     *
     * @param  array<string, mixed> $account
     * @return array<int, array<string, mixed>>
     */
    private function fetchFromProvider(array $account, ?string $since): array
    {
        $provider = (string)$account['provider'];
        $email    = (string)$account['provider_email'];
        $calId    = (string)$account['calendar_id'];

        switch ($provider) {
            case 'google':
                $token  = GoogleCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                $data   = GoogleCalendarClient::listEvents($token, $calId, $since);
                $events = [];
                foreach ($data['items'] ?? [] as $item) {
                    $events[] = $this->normalizeGoogleEvent($item, $account);
                }

                return $events;

            case 'outlook':
                $token  = OutlookCalendarClient::getValidAccessToken((int)$account['user_id'], $email, $this->tokens);
                $items  = OutlookCalendarClient::listEvents($token, $calId, $since);
                $events = [];
                foreach ($items as $item) {
                    $events[] = $this->normalizeOutlookEvent($item, $account);
                }

                return $events;

            case 'apple':
                $tokenRow = $this->tokens->findByUserProviderEmail((int)$account['user_id'], 'apple', $email);
                if ($tokenRow === null) {
                    return [];
                }
                $client = new AppleCalDAVClient($email, (string)$tokenRow['refresh_token']);
                $items  = $client->listEvents($calId, $since);
                $events = [];
                foreach ($items as $item) {
                    $events[] = $this->normalizeAppleEvent($item, $account);
                }

                return $events;

            default:
                return [];
        }
    }

    // ── Conflict resolution ───────────────────────────────────────────────────

    /**
     * Process one remote event: import if new, resolve conflict if existing differs.
     *
     * @param  array<string, mixed> $remote
     * @param  array<string, mixed> $account
     * @return string 'skipped'|'imported'|'conflict'|'updated'
     */
    private function processRemoteEvent(array $remote, array $account, int $userId, string $strategy): string
    {
        $extKey = $account['provider'] . ':' . $account['provider_email'];

        // Check if this external event is already in our DB
        $stmt = $this->db->prepare(
            "SELECT id, title, event_date, start_time, end_time, external_event_ids
               FROM calendar_events
              WHERE external_event_ids->>:key = :extId
                AND created_by IS NOT NULL
              LIMIT 1"
        );
        $stmt->execute([':key' => $extKey, ':extId' => $remote['external_id']]);
        $existing = $stmt->fetch();

        if ($existing === false || $existing === null) {
            // New event from external provider — import it
            $this->importRemoteEvent($remote, $extKey, $userId);

            return 'imported';
        }

        // Event already exists — check for conflict
        $conflict = $this->resolveConflict($existing, $remote, $extKey, $strategy);

        return $conflict;
    }

    /**
     * @param array<string, mixed> $remote
     */
    private function importRemoteEvent(array $remote, string $extKey, int $userId): void
    {
        $extIds = [$extKey => $remote['external_id']];
        $stmt   = $this->db->prepare(
            "INSERT INTO calendar_events
                (title, description, event_date, start_time, end_time, event_type,
                 status, created_by, external_event_ids, sync_status, last_synced_at)
             VALUES
                (:title, :desc, :date, :start, :end, 'in_person',
                 'scheduled', :uid, :ext_ids, 'synced', NOW())"
        );
        $stmt->execute([
            ':title'   => $remote['title'] ?: 'Imported event',
            ':desc'    => $remote['description'] ?? '',
            ':date'    => $remote['date'],
            ':start'   => $remote['start_time'],
            ':end'     => $remote['end_time'],
            ':uid'     => $userId,
            ':ext_ids' => json_encode($extIds, JSON_THROW_ON_ERROR),
        ]);
    }

    /**
     * @param  array<string, mixed> $local
     * @param  array<string, mixed> $remote
     * @return string 'skipped'|'conflict'|'updated'
     */
    private function resolveConflict(array $local, array $remote, string $extKey, string $strategy): string
    {
        $localDate  = (string)($local['event_date'] ?? '');
        $remoteDate = (string)($remote['date'] ?? '');

        if ($localDate === $remoteDate
            && (string)($local['start_time'] ?? '') === (string)($remote['start_time'] ?? '')
            && (string)($local['title'] ?? '') === (string)($remote['title'] ?? '')) {
            return 'skipped';
        }

        if ($strategy === 'remote_wins') {
            $extIds = $this->decodeExternalIds($local['external_event_ids'] ?? '{}');
            $this->db->prepare(
                'UPDATE calendar_events
                    SET title = :title, event_date = :date, start_time = :start, end_time = :end,
                        sync_status = \'synced\', last_synced_at = NOW()
                  WHERE id = :id'
            )->execute([
                ':title' => $remote['title'],
                ':date'  => $remote['date'],
                ':start' => $remote['start_time'],
                ':end'   => $remote['end_time'],
                ':id'    => (int)$local['id'],
            ]);

            return 'updated';
        }

        // local_wins: mark conflict so user can review
        $this->db->prepare(
            "UPDATE calendar_events SET sync_status = 'conflict' WHERE id = :id"
        )->execute([':id' => (int)$local['id']]);

        return 'conflict';
    }

    // ── Event format builders ─────────────────────────────────────────────────

    /**
     * @param  array<string, mixed> $apt
     * @return array<string, mixed>
     */
    private function buildGoogleEvent(array $apt): array
    {
        $date  = (string)($apt['event_date'] ?? date('Y-m-d'));
        $start = (string)($apt['start_time'] ?? '09:00:00');
        $end   = (string)($apt['end_time']   ?? '10:00:00');

        return [
            'summary'     => (string)($apt['title'] ?? $apt['description'] ?? 'Appointment'),
            'description' => (string)($apt['description'] ?? ''),
            'start'       => ['dateTime' => $date . 'T' . $start, 'timeZone' => 'Asia/Kolkata'],
            'end'         => ['dateTime' => $date . 'T' . $end,   'timeZone' => 'Asia/Kolkata'],
        ];
    }

    /**
     * @param  array<string, mixed> $apt
     * @return array<string, mixed>
     */
    private function buildOutlookEvent(array $apt): array
    {
        $date  = (string)($apt['event_date'] ?? date('Y-m-d'));
        $start = (string)($apt['start_time'] ?? '09:00:00');
        $end   = (string)($apt['end_time']   ?? '10:00:00');

        return [
            'subject' => (string)($apt['title'] ?? $apt['description'] ?? 'Appointment'),
            'body'    => [
                'contentType' => 'Text',
                'content'     => (string)($apt['description'] ?? ''),
            ],
            'start' => ['dateTime' => $date . 'T' . $start, 'timeZone' => 'India Standard Time'],
            'end'   => ['dateTime' => $date . 'T' . $end,   'timeZone' => 'India Standard Time'],
        ];
    }

    /**
     * Normalize a Google Calendar event to a common structure.
     *
     * @param  array<string, mixed> $item
     * @param  array<string, mixed> $account
     * @return array<string, mixed>
     */
    private function normalizeGoogleEvent(array $item, array $account): array
    {
        $startRaw = $item['start']['dateTime'] ?? $item['start']['date'] ?? '';
        $endRaw   = $item['end']['dateTime']   ?? $item['end']['date']   ?? '';

        return [
            'external_id' => (string)($item['id'] ?? ''),
            'title'       => (string)($item['summary'] ?? ''),
            'description' => (string)($item['description'] ?? ''),
            'date'        => substr($startRaw, 0, 10),
            'start_time'  => substr($startRaw, 11, 8) ?: '00:00:00',
            'end_time'    => substr($endRaw,   11, 8) ?: '00:00:00',
            'provider'    => 'google',
        ];
    }

    /**
     * @param  array<string, mixed> $item
     * @param  array<string, mixed> $account
     * @return array<string, mixed>
     */
    private function normalizeOutlookEvent(array $item, array $account): array
    {
        $startRaw = $item['start']['dateTime'] ?? '';
        $endRaw   = $item['end']['dateTime']   ?? '';

        return [
            'external_id' => (string)($item['id'] ?? ''),
            'title'       => (string)($item['subject'] ?? ''),
            'description' => (string)($item['body']['content'] ?? ''),
            'date'        => substr($startRaw, 0, 10),
            'start_time'  => substr($startRaw, 11, 8) ?: '00:00:00',
            'end_time'    => substr($endRaw,   11, 8) ?: '00:00:00',
            'provider'    => 'outlook',
        ];
    }

    /**
     * @param  array{uid: string, url: string, ics: string} $item
     * @param  array<string, mixed> $account
     * @return array<string, mixed>
     */
    private function normalizeAppleEvent(array $item, array $account): array
    {
        $ics   = $item['ics'];
        $title = '';
        $date  = date('Y-m-d');
        $start = '00:00:00';
        $end   = '00:00:00';

        if (preg_match('/^SUMMARY:(.+)$/m', $ics, $m)) {
            $title = trim($m[1]);
        }
        if (preg_match('/^DTSTART[^:]*:(\d{8}T\d{6})/m', $ics, $m)) {
            $ts    = \DateTime::createFromFormat('Ymd\THis', $m[1]);
            $date  = $ts ? $ts->format('Y-m-d') : $date;
            $start = $ts ? $ts->format('H:i:s')  : $start;
        }
        if (preg_match('/^DTEND[^:]*:(\d{8}T\d{6})/m', $ics, $m)) {
            $ts  = \DateTime::createFromFormat('Ymd\THis', $m[1]);
            $end = $ts ? $ts->format('H:i:s') : $end;
        }

        return [
            'external_id' => $item['uid'] ?: $item['url'],
            'title'       => $title,
            'description' => '',
            'date'        => $date,
            'start_time'  => $start,
            'end_time'    => $end,
            'provider'    => 'apple',
        ];
    }

    // ── DB helpers ────────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed> $externalIds
     */
    private function updateSyncStatus(int $appointmentId, array $externalIds, string $status): void
    {
        $this->db->prepare(
            'UPDATE calendar_events
                SET external_event_ids = :ids, sync_status = :status, last_synced_at = NOW()
              WHERE id = :id'
        )->execute([
            ':ids'    => json_encode($externalIds, JSON_THROW_ON_ERROR),
            ':status' => $status,
            ':id'     => $appointmentId,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeExternalIds(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            try {
                $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

                return is_array($decoded) ? $decoded : [];
            } catch (\JsonException) {
                // fall through
            }
        }

        return [];
    }
}

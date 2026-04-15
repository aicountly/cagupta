<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\AppointmentModel;
use App\Models\ZoomOAuthTokenModel;

/**
 * Creates and updates Zoom meetings for video appointments (OAuth user tokens).
 */
final class ZoomMeetingService
{
    public static function getValidAccessToken(int $userId): string
    {
        $m   = new ZoomOAuthTokenModel();
        $row = $m->findByUserId($userId);
        if ($row === null) {
            throw new \RuntimeException('Zoom is not connected for this user.');
        }
        $exp = strtotime((string)$row['expires_at']);
        if ($exp > time() + 60) {
            return (string)$row['access_token'];
        }
        $refreshed = ZoomOAuthClient::refreshAccess((string)$row['refresh_token']);
        $expiresAt = date('Y-m-d H:i:s', time() + (int)($refreshed['expires_in'] ?? 3600));
        $m->upsert($userId, [
            'access_token'  => $refreshed['access_token'],
            'refresh_token' => $refreshed['refresh_token'] ?? $row['refresh_token'],
            'expires_at'    => $expiresAt,
            'scope'         => $refreshed['scope'] ?? $row['scope'],
            'account_id'    => $row['account_id'],
        ]);

        return $refreshed['access_token'];
    }

    /**
     * @param array<string, mixed> $appointment from AppointmentModel::find
     */
    public static function syncForAppointment(int $userId, array $appointment): void
    {
        $mode = strtolower((string)($appointment['event_type'] ?? ''));
        if (!in_array($mode, ['video', 'online'], true)) {
            return;
        }
        $status = (string)($appointment['appointment_status'] ?? '');
        if ($status !== 'confirmed') {
            return;
        }

        $token = self::getValidAccessToken($userId);
        $topic = (string)($appointment['title'] ?? 'Meeting');
        $start = self::buildStartIso($appointment);
        $duration = self::estimateDurationMinutes($appointment);

        $body = [
            'topic'      => $topic,
            'type'       => 2,
            'start_time' => $start,
            'duration'   => max(15, $duration),
            'timezone'   => 'Asia/Kolkata',
            'settings'   => [
                'join_before_host'  => true,
                'waiting_room'      => false,
            ],
        ];

        $mid = trim((string)($appointment['zoom_meeting_id'] ?? ''));
        try {
            if ($mid !== '') {
                $patchBody = $body;
                unset($patchBody['type']);
                self::requestJson($token, 'PATCH', 'https://api.zoom.us/v2/meetings/' . rawurlencode($mid), $patchBody);
            } else {
                $res = self::requestJson($token, 'POST', 'https://api.zoom.us/v2/users/me/meetings', $body);
                $newId = (string)($res['id'] ?? '');
                if ($newId === '') {
                    throw new \RuntimeException('Zoom did not return meeting id.');
                }
                (new AppointmentModel())->update((int)$appointment['id'], [
                    'zoom_meeting_id'     => $newId,
                    'zoom_join_url'       => (string)($res['join_url'] ?? ''),
                    'zoom_password'       => (string)($res['password'] ?? ''),
                    'zoom_last_synced_at' => date('Y-m-d H:i:s'),
                    'zoom_sync_error'     => null,
                ]);
            }
        } catch (\Throwable $e) {
            (new AppointmentModel())->update((int)$appointment['id'], [
                'zoom_sync_error' => substr($e->getMessage(), 0, 500),
            ]);
            throw $e;
        }
        (new AppointmentModel())->update((int)$appointment['id'], [
            'zoom_last_synced_at' => date('Y-m-d H:i:s'),
            'zoom_sync_error'     => null,
        ]);
    }

    public static function deleteMeeting(int $userId, string $meetingId): void
    {
        if ($meetingId === '') {
            return;
        }
        $token = self::getValidAccessToken($userId);
        self::requestRaw($token, 'DELETE', 'https://api.zoom.us/v2/meetings/' . rawurlencode($meetingId) . '?schedule_for_reminder=false', null);
    }

    /**
     * @param array<string, mixed> $appointment
     */
    private static function buildStartIso(array $appointment): string
    {
        $date = (string)($appointment['event_date'] ?? date('Y-m-d'));
        $st   = (string)($appointment['start_time'] ?? '09:00:00');
        if (strlen($st) === 5) {
            $st .= ':00';
        }
        $tz = new \DateTimeZone('Asia/Kolkata');
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $date . ' ' . $st, $tz);
        if ($dt === false) {
            $dt = new \DateTimeImmutable('now', $tz);
        }

        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    /**
     * @param array<string, mixed> $appointment
     */
    private static function estimateDurationMinutes(array $appointment): int
    {
        $start = (string)($appointment['start_time'] ?? '');
        $end   = (string)($appointment['end_time'] ?? '');
        if ($start === '' || $end === '') {
            return 60;
        }
        if (strlen($start) === 5) {
            $start .= ':00';
        }
        if (strlen($end) === 5) {
            $end .= ':00';
        }
        $t0 = strtotime('1970-01-01 ' . $start);
        $t1 = strtotime('1970-01-01 ' . $end);
        if ($t0 === false || $t1 === false || $t1 <= $t0) {
            return 60;
        }
        $m = (int)ceil(($t1 - $t0) / 60);

        return max(15, min(480, $m));
    }

    /**
     * @return array<string, mixed>
     */
    private static function requestJson(string $accessToken, string $method, string $url, ?array $body): array
    {
        $raw = self::requestRaw($accessToken, $method, $url, $body);
        if ($raw === '' || $raw === 'null') {
            return [];
        }
        $dec = json_decode($raw, true);

        return is_array($dec) ? $dec : [];
    }

    private static function requestRaw(string $accessToken, string $method, string $url, ?array $body): string
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        $headers = [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 30,
        ];
        if ($body !== null && ($method === 'POST' || $method === 'PATCH')) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        curl_setopt_array($ch, $opts);
        $response = curl_exec($ch);
        $http     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($response === false) {
            throw new \RuntimeException('Zoom HTTP empty response');
        }
        if ($http === 204) {
            return '';
        }
        if ($http < 200 || $http >= 300) {
            throw new \RuntimeException('Zoom HTTP ' . $http . ': ' . substr((string)$response, 0, 400));
        }

        return (string)$response;
    }
}

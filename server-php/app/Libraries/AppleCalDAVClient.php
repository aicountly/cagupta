<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Apple iCloud CalDAV client.
 *
 * Apple iCloud Calendar exposes a CalDAV endpoint at caldav.icloud.com.
 * Authentication uses the user's Apple ID email and an App-Specific Password
 * (generated at appleid.apple.com → Security → App-Specific Passwords).
 * No OAuth is involved; credentials are static.
 *
 * CalDAV protocol: RFC 4791
 */
final class AppleCalDAVClient
{
    private const DISCOVERY_URL    = 'https://caldav.icloud.com';
    private const PRINCIPAL_PATH   = '/principals/user/';

    private string $appleId;
    private string $appPassword;

    public function __construct(string $appleId, string $appPassword)
    {
        $this->appleId     = $appleId;
        $this->appPassword = $appPassword;
    }

    /**
     * Verify credentials by fetching the principal URL.
     * Returns the home-set URL on success, throws on failure.
     */
    public function verifyConnection(): string
    {
        $principalUrl = self::DISCOVERY_URL . self::PRINCIPAL_PATH . $this->appleId;
        $xml = <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
    <d:displayname/>
  </d:prop>
</d:propfind>
XML;
        $resp = $this->request('PROPFIND', $principalUrl, $xml, ['Depth: 0']);
        if ($resp['code'] !== 207) {
            throw new \RuntimeException(
                'Apple CalDAV verification failed (HTTP ' . $resp['code'] . '). '
                . 'Check Apple ID and App-Specific Password.'
            );
        }

        // Parse calendar-home-set href from response
        $href = $this->extractHref($resp['body'], 'calendar-home-set');

        return $href ?: self::DISCOVERY_URL;
    }

    /**
     * List all calendars for the authenticated user.
     *
     * @return array<int, array{id: string, name: string, url: string}>
     */
    public function listCalendars(): array
    {
        $homeUrl = $this->verifyConnection();
        $xml = <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:getctag/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>
XML;
        $resp = $this->request('PROPFIND', $homeUrl, $xml, ['Depth: 1']);
        if ($resp['code'] !== 207) {
            return [];
        }

        return $this->parseCalendarList($resp['body'], $homeUrl);
    }

    /**
     * Create or update an event (PUT with iCalendar data).
     *
     * @param string $calendarUrl Full URL to the calendar collection
     * @param string $uid         Event UID (used as the filename)
     * @param string $icsData     iCalendar (RFC 5545) text
     * @return string The etag of the created/updated resource
     */
    public function putEvent(string $calendarUrl, string $uid, string $icsData): string
    {
        $url  = rtrim($calendarUrl, '/') . '/' . $uid . '.ics';
        $resp = $this->request('PUT', $url, $icsData, [
            'Content-Type: text/calendar; charset=utf-8',
        ]);
        if ($resp['code'] < 200 || $resp['code'] >= 300) {
            throw new \RuntimeException('CalDAV PUT failed (' . $resp['code'] . ')');
        }

        $etag = $resp['headers']['etag'] ?? '';

        return is_array($etag) ? ($etag[0] ?? '') : (string)$etag;
    }

    /**
     * Delete an event by its URL.
     */
    public function deleteEvent(string $eventUrl): void
    {
        $resp = $this->request('DELETE', $eventUrl, '');
        if ($resp['code'] !== 204 && $resp['code'] !== 200) {
            throw new \RuntimeException('CalDAV DELETE failed (' . $resp['code'] . ')');
        }
    }

    /**
     * Fetch events modified after a given datetime (ISO 8601).
     *
     * @return array<int, array{uid: string, url: string, ics: string}>
     */
    public function listEvents(string $calendarUrl, ?string $modifiedSince = null): array
    {
        $timeFilter = '';
        if ($modifiedSince !== null) {
            $start = date('Ymd\THis\Z', strtotime($modifiedSince));
            $end   = date('Ymd\THis\Z', strtotime('+1 year'));
            $timeFilter = <<<XML
  <c:time-range start="{$start}" end="{$end}"/>
XML;
        }
        $xml = <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        {$timeFilter}
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>
XML;
        $resp = $this->request('REPORT', $calendarUrl, $xml, ['Depth: 1']);
        if ($resp['code'] !== 207) {
            return [];
        }

        return $this->parseEventList($resp['body']);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Build a minimal VEVENT iCalendar string from appointment data.
     *
     * @param array<string, mixed> $appointment
     */
    public static function buildIcs(array $appointment): string
    {
        $uid     = 'cagupta-appt-' . ($appointment['id'] ?? uniqid());
        $dtStart = self::toCalDAVDate($appointment['event_date'] ?? date('Y-m-d'), $appointment['start_time'] ?? '09:00:00');
        $dtEnd   = self::toCalDAVDate($appointment['event_date'] ?? date('Y-m-d'), $appointment['end_time']   ?? '10:00:00');
        $summary = self::icsEscape((string)($appointment['title'] ?? $appointment['description'] ?? 'Appointment'));
        $desc    = self::icsEscape((string)($appointment['description'] ?? ''));
        $now     = gmdate('Ymd\THis\Z');

        return "BEGIN:VCALENDAR\r\n"
             . "VERSION:2.0\r\n"
             . "PRODID:-//CAGupta//Calendar//EN\r\n"
             . "BEGIN:VEVENT\r\n"
             . "UID:{$uid}\r\n"
             . "DTSTAMP:{$now}\r\n"
             . "DTSTART:{$dtStart}\r\n"
             . "DTEND:{$dtEnd}\r\n"
             . "SUMMARY:{$summary}\r\n"
             . ($desc !== '' ? "DESCRIPTION:{$desc}\r\n" : '')
             . "END:VEVENT\r\n"
             . "END:VCALENDAR\r\n";
    }

    private static function toCalDAVDate(string $date, string $time): string
    {
        $ts = strtotime($date . ' ' . $time);

        return gmdate('Ymd\THis\Z', $ts ?: time());
    }

    private static function icsEscape(string $s): string
    {
        return str_replace(["\r\n", "\n", "\r", ',', ';', '\\'], ['\\n', '\\n', '\\n', '\\,', '\\;', '\\\\'], $s);
    }

    private function extractHref(string $xml, string $element): string
    {
        if (preg_match('/<[^:]*:?' . preg_quote($element, '/') . '[^>]*>\s*<[^:]*:?href[^>]*>([^<]+)/i', $xml, $m)) {
            return trim($m[1]);
        }

        return '';
    }

    /**
     * @return array<int, array{id: string, name: string, url: string}>
     */
    private function parseCalendarList(string $xml, string $baseUrl): array
    {
        $calendars = [];
        if (preg_match_all('/<d:response>(.*?)<\/d:response>/s', $xml, $responses)) {
            foreach ($responses[1] as $block) {
                if (!str_contains($block, 'calendar')) {
                    continue;
                }
                $href = '';
                $name = '';
                if (preg_match('/<d:href>([^<]+)<\/d:href>/', $block, $m)) {
                    $href = trim($m[1]);
                }
                if (preg_match('/<d:displayname>([^<]*)<\/d:displayname>/', $block, $m)) {
                    $name = trim($m[1]);
                }
                if ($href !== '' && !in_array($href, ['/', self::DISCOVERY_URL . '/'], true)) {
                    $url = str_starts_with($href, 'http') ? $href : self::DISCOVERY_URL . $href;
                    $calendars[] = [
                        'id'   => $href,
                        'name' => $name ?: 'Calendar',
                        'url'  => $url,
                    ];
                }
            }
        }

        return $calendars;
    }

    /**
     * @return array<int, array{uid: string, url: string, ics: string}>
     */
    private function parseEventList(string $xml): array
    {
        $events = [];
        if (preg_match_all('/<d:response>(.*?)<\/d:response>/s', $xml, $responses)) {
            foreach ($responses[1] as $block) {
                $href = '';
                $ics  = '';
                if (preg_match('/<d:href>([^<]+)<\/d:href>/', $block, $m)) {
                    $href = trim($m[1]);
                }
                if (preg_match('/<cal:calendar-data[^>]*>(.*?)<\/cal:calendar-data>/s', $block, $m)
                    || preg_match('/<c:calendar-data[^>]*>(.*?)<\/c:calendar-data>/s', $block, $m)) {
                    $ics = trim($m[1]);
                }
                if ($href !== '' && $ics !== '') {
                    $uid = '';
                    if (preg_match('/^UID:(.+)$/m', $ics, $m)) {
                        $uid = trim($m[1]);
                    }
                    $events[] = [
                        'uid'  => $uid,
                        'url'  => str_starts_with($href, 'http') ? $href : self::DISCOVERY_URL . $href,
                        'ics'  => $ics,
                    ];
                }
            }
        }

        return $events;
    }

    /**
     * @param  string[] $extraHeaders
     * @return array{code: int, headers: array<string, string|string[]>, body: string}
     */
    private function request(string $method, string $url, string $body, array $extraHeaders = []): array
    {
        $auth    = base64_encode($this->appleId . ':' . $this->appPassword);
        $headers = array_merge([
            'Authorization: Basic ' . $auth,
            'Content-Type: application/xml; charset=utf-8',
        ], $extraHeaders);

        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        $responseHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HEADERFUNCTION => static function ($ch, $header) use (&$responseHeaders): int {
                $len  = strlen($header);
                $line = trim($header);
                if (str_contains($line, ':')) {
                    [$key, $val] = explode(':', $line, 2);
                    $responseHeaders[strtolower(trim($key))] = trim($val);
                }

                return $len;
            },
        ]);
        $respBody = curl_exec($ch);
        $code     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'code'    => $code,
            'headers' => $responseHeaders,
            'body'    => is_string($respBody) ? $respBody : '',
        ];
    }
}

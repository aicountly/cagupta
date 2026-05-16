<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Application-level configuration.
 *
 * All values can be overridden via .env — see loadEnv() in public/index.php.
 */
class App
{
    /** Human-readable application name. */
    public string $name = 'CA Gupta Office Portal';

    /** Base URL served to clients (no trailing slash). */
    public string $baseURL = 'http://localhost:8080';

    /** Running environment: development | testing | production */
    public string $environment = 'development';

    /** Default PHP timezone. */
    public string $timezone = 'Asia/Kolkata';

    /** Allowed CORS origin (React dev server or production domain). */
    public string $corsOrigin = 'http://localhost:5173';

    /**
     * When true: staff may request a ledger reversal OTP on their own email and
     * confirm with that OTP (30-day window). Superadmin OTP path is unaffected.
     * Env: LEDGER_USER_REVERSAL_ENABLED=true|false
     */
    public bool $ledgerUserReversalEnabled = false;

    public function __construct()
    {
        $this->baseURL     = getenv('BASE_URL')     ?: $this->baseURL;
        $this->environment = getenv('APP_ENV')      ?: $this->environment;
        $this->corsOrigin  = getenv('CORS_ORIGIN')  ?: $this->corsOrigin;

        $rev = getenv('LEDGER_USER_REVERSAL_ENABLED');
        if ($rev !== false && $rev !== '') {
            $this->ledgerUserReversalEnabled = filter_var($rev, FILTER_VALIDATE_BOOLEAN);
        }
    }
}

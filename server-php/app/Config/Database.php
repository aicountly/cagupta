<?php
declare(strict_types=1);

namespace App\Config;

/**
 * PostgreSQL database connection configuration.
 *
 * Values are read from the .env file loaded by public/index.php.
 *
 * Default username matches the cPanel-created PostgreSQL role for this project.
 * Override with DB_USER in .env (e.g. DB_USER=postgres for local Docker).
 */
class Database
{
    public string $host     = 'localhost';
    public int    $port     = 5432;
    public string $dbname   = 'cagupta_db';
    public string $username = 'carahulgupta_cagupta_user';
    public string $password = '';

    /** PDO connection options. */
    public array $options = [
        \PDO::ATTR_ERRMODE            => \PDO::ERRMODE_EXCEPTION,
        \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
        \PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    private static ?\PDO $instance = null;

    public function __construct()
    {
        $this->host     = getenv('DB_HOST') ?: $this->host;
        $this->port     = (int)(getenv('DB_PORT') ?: $this->port);
        $this->dbname   = getenv('DB_NAME') ?: $this->dbname;
        $this->username = getenv('DB_USER') ?: $this->username;
        $this->password = getenv('DB_PASS') ?: $this->password;
    }

    /**
     * Return a singleton PDO connection.
     *
     * @throws \RuntimeException when connection fails.
     */
    public static function getConnection(): \PDO
    {
        if (self::$instance === null) {
            $cfg = new self();
            $dsn = "pgsql:host={$cfg->host};port={$cfg->port};dbname={$cfg->dbname}";
            try {
                self::$instance = new \PDO($dsn, $cfg->username, $cfg->password, $cfg->options);
            } catch (\PDOException $e) {
                throw new \RuntimeException('Database connection failed: ' . $e->getMessage());
            }
        }
        return self::$instance;
    }
}

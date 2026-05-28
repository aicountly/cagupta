<?php
declare(strict_types=1);

namespace App\Controllers\System;

use App\Controllers\BaseController;
use App\Config\Database;
use App\Models\RoleModel;
use App\Models\UserModel;

/**
 * Public diagnostics for production debugging (no auth).
 * GET /api/system/diag
 */
class DiagController extends BaseController
{
    public function index(): never
    {
        $flags = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;
        $out   = [
            'php_version'       => PHP_VERSION,
            'php_version_ok'    => version_compare(PHP_VERSION, '8.1.0', '>='),
            'app_env'           => getenv('APP_ENV') ?: '(unset)',
            'sapi'              => PHP_SAPI,
            'db'                => 'pending',
            'roles_count'       => null,
            'roles_json_encode' => 'pending',
            'users_paginate'    => 'pending',
            'users_json_encode' => 'pending',
            'user_controller'   => 'pending',
            'deploy_markers'    => [],
        ];

        try {
            Database::getConnection();
            $out['db'] = 'ok';
        } catch (\Throwable $e) {
            $out['db'] = 'fail: ' . $e->getMessage();
        }

        try {
            $roles = (new RoleModel())->all();
            $out['roles_count'] = count($roles);
            json_encode($roles, $flags);
            $out['roles_json_encode'] = 'ok';
        } catch (\Throwable $e) {
            $out['roles_json_encode'] = 'fail: ' . $e->getMessage();
        }

        try {
            $users = (new UserModel())->paginate(1, 5);
            $out['users_paginate'] = 'ok total=' . $users['total'];
            json_encode($users['users'], $flags);
            $out['users_json_encode'] = 'ok';
        } catch (\Throwable $e) {
            $out['users_paginate'] = 'fail: ' . $e->getMessage();
        }

        try {
            if (!class_exists(\App\Controllers\Admin\UserController::class)) {
                $out['user_controller'] = 'class not found';
            } else {
                $ref = new \ReflectionClass(\App\Controllers\Admin\UserController::class);
                $out['deploy_markers']['formatRoleRow'] = $ref->hasMethod('formatRoleRow');
                $out['deploy_markers']['actorCanManageAllUsers'] = $ref->hasMethod('actorCanManageAllUsers');
                new \App\Controllers\Admin\UserController();
                $out['user_controller'] = 'ok';
            }
        } catch (\Throwable $e) {
            $out['user_controller'] = 'fail: ' . $e->getMessage();
        }

        $last = error_get_last();
        if ($last !== null) {
            $out['last_php_error'] = $last;
        }

        $this->success($out, 'Diagnostics');
    }
}

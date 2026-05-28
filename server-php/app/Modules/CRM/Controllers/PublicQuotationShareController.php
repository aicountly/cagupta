<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Libraries\QuotationShareService;

/**
 * Public quotation PDF download by share token.
 */
class PublicQuotationShareController extends BaseController
{
    // GET /api/public/quotation-shares/:token
    public function download(string $token): never
    {
        $token = trim($token);
        if ($token === '') {
            $this->error('Invalid token.', 404);
        }
        (new QuotationShareService())->streamPdfByToken($token);
    }
}

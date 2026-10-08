import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { AccessTokenService } from '../auth/access-token.service';
import { RetailService } from './retail.service';
import { AdjustStockDto, CreateSaleDto } from './retail.dto';

@Controller('retail')
export class RetailController {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly retail: RetailService,
  ) {}
  @Get()
  async dashboard(@Headers('authorization') authorization?: string) {
    return this.retail.dashboard(
      await this.accessTokens.authenticate(authorization, 'store.read'),
    );
  }
  private origin(origin?: string) {
    if (origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000'))
      throw new ForbiddenException('Invalid request origin');
  }
  @Post('inventory/:id/adjust')
  async adjust(
    @Headers('authorization') authorization: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
    @Body() body: AdjustStockDto,
  ) {
    this.origin(origin);
    return this.retail.adjust(
      await this.accessTokens.authenticate(authorization, 'inventory.adjust'),
      id,
      body,
    );
  }
  @Post('sales')
  async sale(
    @Headers('authorization') authorization: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() body: CreateSaleDto,
  ) {
    this.origin(origin);
    return this.retail.sale(
      await this.accessTokens.authenticate(authorization, 'order.create'),
      body,
    );
  }
}

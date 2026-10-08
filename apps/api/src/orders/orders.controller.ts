import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AccessTokenService } from '../auth/access-token.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly orders: OrdersService,
  ) {}

  @Get('access-summary')
  async accessSummary(
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.orders.accessSummary(
      await this.accessTokens.authenticate(authorization),
    );
  }

  @Get(':id')
  async findOne(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    return this.orders.findOne(
      await this.accessTokens.authenticate(authorization, 'order.read'),
      id,
    );
  }

  @Patch(':id')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    this.requireTrustedOrigin(origin);
    return this.orders.updateStatus(
      await this.accessTokens.authenticate(
        authorization,
        'order.update_status',
      ),
      id,
      body.status,
    );
  }

  @Post(':id/refund')
  async refund(
    @Headers('authorization') authorization: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
  ) {
    this.requireTrustedOrigin(origin);
    return this.orders.refund(
      await this.accessTokens.authenticate(authorization),
      id,
    );
  }

  private requireTrustedOrigin(origin: string | undefined) {
    if (origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000')) {
      throw new ForbiddenException('Invalid request origin');
    }
  }
}

import { Module } from '@nestjs/common';
import { TableroController } from './tablero.controller';
import { TableroService } from './tablero.service';

@Module({
  controllers: [TableroController],
  providers: [TableroService],
})
export class TableroModule {}

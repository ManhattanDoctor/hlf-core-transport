import { TransportCommandOptions } from '@ts-core/common/transport';
import { Signature } from '@ts-core/common/crypto';
import { IsOptional, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ITransportFabricCommandOptions } from './ITransportFabricCommandOptions';

export class TransportFabricCommandOptions extends TransportCommandOptions implements ITransportFabricCommandOptions {
    @IsString()
    @IsOptional()
    userId?: string;

    @IsOptional()
    @Type(() => Signature)
    @ValidateNested()
    signature?: Signature;
}

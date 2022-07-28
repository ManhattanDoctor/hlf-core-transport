import { TransportCommandOptions } from '@ts-core/common';
import { Signature } from '@ts-core/common';
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

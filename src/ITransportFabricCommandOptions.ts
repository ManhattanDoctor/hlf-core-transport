import { ISignature } from '@ts-core/common';
import { ITransportCommandOptions } from '@ts-core/common';

export interface ITransportFabricCommandOptions extends ITransportCommandOptions {
    userId?: string;
    signature?: ISignature;
}

import { ISignature } from '@ts-core/common/crypto';
import { ITransportCommandOptions } from '@ts-core/common/transport';

export interface ITransportFabricCommandOptions extends ITransportCommandOptions {
    userId?: string;
    signature?: ISignature;
}

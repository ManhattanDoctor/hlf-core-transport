import { ITransportFabricCommandOptions } from './ITransportFabricCommandOptions';

export interface ITransportFabricRequestPayload<U = any> {
    id: string;
    name: string;
    request?: U;
    options: ITransportFabricCommandOptions;
    isNeedReply: boolean;
}

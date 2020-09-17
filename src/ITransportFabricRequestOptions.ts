import { ITransportFabricRequestPayload } from './ITransportFabricRequestPayload';

export interface ITransportFabricRequestOptions<U = any> {
    method: string;
    payload: ITransportFabricRequestPayload<U>;
}

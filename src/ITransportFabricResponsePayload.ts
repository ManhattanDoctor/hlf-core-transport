import { ExtendedError } from '@ts-core/common/error';

export interface ITransportFabricResponsePayload<V = any> {
    id: string;
    response?: V | ExtendedError;
}

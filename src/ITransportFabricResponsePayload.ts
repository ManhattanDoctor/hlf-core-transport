import { ExtendedError } from '@ts-core/common';

export interface ITransportFabricResponsePayload<V = any> {
    id: string;
    response?: V | ExtendedError;
}

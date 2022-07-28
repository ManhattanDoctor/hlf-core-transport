import { ExtendedError } from '@ts-core/common';
import { ITransportCommand, Transport } from '@ts-core/common';
import { TransportInvalidDataError } from '@ts-core/common';
import { TransformUtil, ValidateUtil } from '@ts-core/common';
import { IsOptional, IsString } from 'class-validator';
import * as _ from 'lodash';
import { ITransportFabricResponsePayload } from './ITransportFabricResponsePayload';

export class TransportFabricResponsePayload<U = any, V = any> implements ITransportFabricResponsePayload<V> {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static parse<U, V>(buffer: Buffer): TransportFabricResponsePayload<U, V> {
        if (_.isNil(buffer) || buffer.length === 0) {
            throw new TransportInvalidDataError(`Invalid payload: nil response message`, buffer);
        }

        let payload: TransportFabricResponsePayload<U, V> = null;
        try {
            payload = TransformUtil.toClassBuffer<TransportFabricResponsePayload<U, V>>(TransportFabricResponsePayload, buffer);
        } catch (error) {
            throw new TransportInvalidDataError(`Invalid payload: ${error.message}`, buffer.toString(TransformUtil.ENCODING));
        }
        ValidateUtil.validate(payload);
        return payload;
    }

    public static fromError(id: string, error: ExtendedError): ITransportFabricResponsePayload {
        let payload = new TransportFabricResponsePayload();
        payload.id = id;
        payload.response = error;
        return payload;
    }

    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    @IsString()
    public id: string;

    @IsOptional()
    public response?: V | ExtendedError;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(command?: ITransportCommand<U>) {
        if (_.isNil(command)) {
            return;
        }
        this.id = command.id;
        if (Transport.isCommandAsync(command)) {
            this.response = _.isNil(command.error) ? command.data : command.error;
        }
    }
}

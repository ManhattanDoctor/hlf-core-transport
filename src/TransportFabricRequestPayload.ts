import { TransportInvalidDataError } from '@ts-core/common/transport/error';
import { TransformUtil, ValidateUtil } from '@ts-core/common/util';
import { IsBoolean, IsOptional, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ChaincodeStub } from 'fabric-shim';
import { TRANSPORT_FABRIC_METHOD } from './constants';
import { ITransportFabricRequestPayload } from './ITransportFabricRequestPayload';
import { TransportFabricCommandOptions } from './TransportFabricCommandOptions';
import * as _ from 'lodash';

export class TransportFabricRequestPayload<U = any> implements ITransportFabricRequestPayload<U> {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static parse<U = any>(stub: ChaincodeStub): TransportFabricRequestPayload<U> {
        let item = stub.getFunctionAndParameters();
        if (item.fcn !== TRANSPORT_FABRIC_METHOD) {
            throw new TransportInvalidDataError(`Invalid payload: function must be "${TRANSPORT_FABRIC_METHOD}"`, item.fcn);
        }
        if (item.params.length !== 1) {
            throw new TransportInvalidDataError(`Invalid payload: params length must be 1`, item.params.length);
        }
        let content = item.params[0];
        let payload: TransportFabricRequestPayload = null;
        try {
            payload = TransformUtil.toClass<TransportFabricRequestPayload<U>>(TransportFabricRequestPayload, TransformUtil.toJSON(content));
        } catch (error) {
            throw new TransportInvalidDataError(`Invalid payload: ${error.message}`, content);
        }
        ValidateUtil.validate(payload);
        return payload;
    }

    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    @IsString()
    public id: string;

    @IsString()
    public name: string;

    @IsOptional()
    public request?: U;

    @Type(() => TransportFabricCommandOptions)
    @IsOptional()
    @ValidateNested()
    public options?: TransportFabricCommandOptions;

    @IsOptional()
    @IsBoolean()
    public isNeedReply?: boolean;

    @IsOptional()
    @IsBoolean()
    public isReadonly?: boolean;
}

import { TransportInvalidDataError } from '@ts-core/common/transport/error';
import { TransformUtil, ValidateUtil } from '@ts-core/common/util';
import { IsBoolean, IsOptional, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ChaincodeStub } from 'fabric-shim';
import { TRANSPORT_FABRIC_METHOD } from './constants';
import { ITransportFabricRequestPayload } from './ITransportFabricRequestPayload';
import { TransportFabricCommandOptions } from './TransportFabricCommandOptions';
import * as _ from 'lodash';
import { ITransportCommandOptions, Transport } from '@ts-core/common/transport';
import { TransportCryptoManagerEd25519 } from '@ts-core/common/transport/crypto';
import { ITransportFabricCommandOptions } from './ITransportFabricCommandOptions';

export class TransportFabricRequestPayload<U = any> implements ITransportFabricRequestPayload<U> {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static parse<U = any>(stub: ChaincodeStub, isNeedSetDefaultOptions: boolean): ITransportFabricRequestPayload<U> {
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
            if (isNeedSetDefaultOptions) {
                TransportFabricRequestPayload.setDefaultOptions(payload);
            }
        } catch (error) {
            throw new TransportInvalidDataError(`Invalid payload: ${error.message}`, content);
        }
        ValidateUtil.validate(payload);
        return payload;
    }

    public static clear<U>(payload: ITransportFabricRequestPayload<U>): void {
        TransportFabricRequestPayload.clearDefaultOptions(payload.options);
        if (_.isEmpty(payload.options)) {
            delete payload.options;
        }
    }

    public static setDefaultOptions<U>(payload: ITransportFabricRequestPayload<U>): void {
        if (_.isNil(payload)) {
            return;
        }
        let options = payload.options;
        if (_.isNil(options)) {
            options = payload.options = {};
        }
        if (_.isNil(options.timeout)) {
            options.timeout = Transport.DEFAULT_TIMEOUT;
        }
        if (_.isNil(options.waitDelay)) {
            options.waitDelay = Transport.DEFAULT_WAIT_DELAY;
        }
        if (_.isNil(options.waitMaxCount)) {
            options.waitMaxCount = Transport.DEFAULT_WAIT_MAX_COUNT;
        }
        if (!_.isNil(options.signature) && _.isNil(options.signature.algorithm)) {
            options.signature.algorithm = TransportCryptoManagerEd25519.ALGORITHM;
        }
    }

    public static clearDefaultOptions(options: ITransportFabricCommandOptions): void {
        if (_.isNil(options)) {
            return;
        }
        if (options.timeout === Transport.DEFAULT_TIMEOUT) {
            delete options.timeout;
        }
        if (options.waitDelay === Transport.DEFAULT_WAIT_DELAY) {
            delete options.waitDelay;
        }
        if (options.waitMaxCount === Transport.DEFAULT_WAIT_MAX_COUNT) {
            delete options.waitMaxCount;
        }
        if (!_.isNil(options.signature) && options.signature.algorithm === TransportCryptoManagerEd25519.ALGORITHM) {
            delete options.signature.algorithm;
        }
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

import { TransportCommandAsync, ITransportCommand, ITransportCommandAsync } from '@ts-core/common/transport';
import { TransportInvalidDataError } from '@ts-core/common/transport/error';
import { TransformUtil, ValidateUtil } from '@ts-core/common/util';
import { IsBoolean, IsDefined, IsOptional, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ChaincodeStub } from 'fabric-shim';
import { TRANSPORT_FABRIC_METHOD } from './constants';
import { ITransportFabricRequestPayload } from './ITransportFabricRequestPayload';
import { TransportFabricChaincodeReceiver } from './chaincode';
import { TransportFabricCommandOptions } from './TransportFabricCommandOptions';
import { TransportFabricStub, ITransportFabricStub, ITransportFabricStubHolder } from './chaincode/stub';

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

    public static createCommand<U>(
        payload: TransportFabricRequestPayload<U>,
        stub: ChaincodeStub,
        manager: TransportFabricChaincodeReceiver
    ): ITransportCommand<U> {
        return new TransportCommandFabricAsyncImpl(payload, stub, manager);
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
    @IsDefined()
    @ValidateNested()
    public options: TransportFabricCommandOptions;

    @IsBoolean()
    public isNeedReply: boolean;
}

// --------------------------------------------------------------------------
//
//  Command Implementation
//
// --------------------------------------------------------------------------

class TransportCommandFabricAsyncImpl<U, V> extends TransportCommandAsync<U, V> implements ITransportCommandAsync<U, V>, ITransportFabricStubHolder {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    private _stub: TransportFabricStub;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(payload: TransportFabricRequestPayload<U>, stub: ChaincodeStub, transport: TransportFabricChaincodeReceiver) {
        super(payload.name, payload.request, payload.id);
        this._stub = new TransportFabricStub(stub, payload.id, payload.options, transport);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public destroy(): void {
        this._stub.destroy();
        this._stub = null;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Properties
    //
    // --------------------------------------------------------------------------

    public get stub(): ITransportFabricStub {
        return this._stub;
    }
}

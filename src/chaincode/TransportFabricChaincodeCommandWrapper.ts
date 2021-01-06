import { ITransportCommand, ITransportCommandAsync, Transport } from '@ts-core/common/transport';
import { ITransportFabricStub, ITransportFabricStubHolder } from '../chaincode/stub';
import * as _ from 'lodash';
import { ExtendedError } from '@ts-core/common/error';
import { ITransportFabricRequestPayload } from '../ITransportFabricRequestPayload';

export class TransportFabricChaincodeCommandWrapper<U = any, V = any> implements ITransportCommandAsync<U, V>, ITransportFabricStubHolder {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected _stub: ITransportFabricStub;

    protected payload: ITransportFabricRequestPayload<U>;
    protected command: ITransportCommand<U>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(payload: ITransportFabricRequestPayload<U>, command: ITransportCommand<U>, stub: ITransportFabricStub) {
        this._stub = stub;

        this.payload = payload;
        this.command = command;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public response(value: V | ExtendedError | Error): void {
        if (Transport.isCommandAsync(this.command)) {
            this.command.response(value);
        }
    }

    public destroy(): void {
        if (!_.isNil(this.stub)) {
            this.stub.destroy();
            this._stub = null;
        }
        this.command = null;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Properties
    //
    // --------------------------------------------------------------------------

    public get stub(): ITransportFabricStub {
        return this._stub;
    }

    public get id(): string {
        return this.payload.id;
    }

    public get name(): string {
        return this.command.name;
    }

    public get request(): U {
        return this.command.request;
    }

    public get data(): V {
        return Transport.isCommandAsync(this.command) ? this.command.data : null;
    }

    public get error(): ExtendedError {
        return Transport.isCommandAsync(this.command) ? this.command.error : null;
    }
}

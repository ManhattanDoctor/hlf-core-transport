import { ITransportEvent, ITransportReceiver } from '@ts-core/common';
import { ChaincodeStub, Iterators } from 'fabric-shim';
import * as _ from 'lodash';
import { ITransportFabricCommandOptions } from '../../ITransportFabricCommandOptions';
import { IKeyValue, TransportFabricStub } from '../stub';
import { StateProxy } from './StateProxy';

export class TransportFabricStubWrapper extends TransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected state: StateProxy;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(stub: ChaincodeStub, requestId: string, options: ITransportFabricCommandOptions, transport: ITransportReceiver) {
        super(stub, requestId, options, transport);
        this.state = new StateProxy(this.getStateRawProxy);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    protected getStateRawProxy = (item: string): Promise<string> => super.getStateRaw(item);

    public async complete(): Promise<void> {
        for (let key of this.state.toRemove) {
            await super.removeState(key);
        }
        for (let key of this.state.toPut.keys()) {
            await super.putStateRaw(key, this.state.toPut.get(key));
        }
        for (let item of this.state.events) {
            await super.dispatch(item);
        }
        this.destroy();
    }

    // --------------------------------------------------------------------------
    //
    //  Public Override Methods
    //
    // --------------------------------------------------------------------------

    public async loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<IKeyValue>> {
        let items = await super.loadKV(iterator);
        this.state.checkKV(items);
        return items;
    }

    public async getStateRaw(key: string): Promise<string> {
        return this.state.getState(key);
    }

    public async putStateRaw(key: string, item: string): Promise<void> {
        this.state.putState(key, item);
    }

    public async removeState(key: string): Promise<void> {
        this.state.removeState(key);
    }

    public async dispatch<T>(value: ITransportEvent<T>, isNeedValidate: boolean = true): Promise<void> {
        this.state.dispatch(value, isNeedValidate);
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }
        super.destroy();
        this.getStateRawProxy = null;

        this.state.destroy();
        this.state = null;
    }
}

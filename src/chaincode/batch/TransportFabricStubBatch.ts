import * as _ from 'lodash';
import { ITransportEvent } from '@ts-core/common/transport';

import { TransportFabricStubWrapper } from './TransportFabricStubWrapper';
import { Iterators, StateQueryResponse } from 'fabric-shim';
import { IKeyValue, TransportFabricStub } from '../stub';
import { ITransportFabricRequestPayload } from '../../ITransportFabricRequestPayload';

export class TransportFabricStubBatch extends TransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected wrapper: TransportFabricStubWrapper;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(transactionHash: string, transactionDate: Date, wrapper: TransportFabricStubWrapper, payload: ITransportFabricRequestPayload) {
        super(null, payload.id, payload.options, null);
        this.wrapper = wrapper;
        this.eventsToDispatch = null;

        this._transactionHash = transactionHash;
        this._transactionDate = transactionDate;
    }

    // --------------------------------------------------------------------------
    //
    //  Public State Methods
    //
    // --------------------------------------------------------------------------

    public async loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<IKeyValue>> {
        return this.wrapper.loadKV(iterator);
    }

    public async getStateRaw(key: string): Promise<string> {
        return this.wrapper.getStateRaw(key);
    }

    public async putStateRaw(key: string, item: string): Promise<void> {
        return this.wrapper.putStateRaw(key, item);
    }

    public async removeState(key: string): Promise<void> {
        return this.wrapper.removeState(key);
    }

    public async getStateByRange(startKey: string, endKey: string): Promise<Iterators.StateQueryIterator> {
        return this.wrapper.getStateByRange(startKey, endKey);
    }

    public async getStateByRangeWithPagination(
        startKey: string,
        endKey: string,
        pageSize: number,
        bookmark?: string
    ): Promise<StateQueryResponse<Iterators.StateQueryIterator>> {
        return this.wrapper.getStateByRangeWithPagination(startKey, endKey, pageSize, bookmark);
    }

    public async dispatch<T>(value: ITransportEvent<T>, isNeedValidate?: boolean): Promise<void> {
        return this.wrapper.dispatch(value, isNeedValidate);
    }

    public dispatchEvents(): void {
        // do nothing, wrapper dispatchs all events
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }
        super.destroy();

        this.wrapper = null;
    }
}

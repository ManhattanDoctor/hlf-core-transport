import * as _ from 'lodash';
import { TransportFabricStubWrapper } from './TransportFabricStubWrapper';
import { Iterators, StateQueryResponse } from 'fabric-shim';
import { ITransportCommand, ITransportEvent, Transport } from '@ts-core/common';
import { StateProxy } from './StateProxy';
import { IKeyValue, TransportFabricStub } from '../stub';
import { ITransportFabricRequestPayload } from '../../ITransportFabricRequestPayload';

export class TransportFabricStubBatch<U = any> extends TransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected wrapper: TransportFabricStubWrapper;
    protected state: StateProxy;

    // It needs for check response and commit temporary state
    public command: ITransportCommand<U>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(transactionHash: string, transactionDate: Date, wrapper: TransportFabricStubWrapper, payload: ITransportFabricRequestPayload) {
        super(null, payload.id, payload.options, null);
        this.wrapper = wrapper;
        this.state = new StateProxy(this.getStateRawProxy);

        this._transactionHash = transactionHash;
        this._transactionDate = transactionDate;
    }

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected async stateCommitIfNeed(isError: boolean): Promise<void> {
        if (isError) {
            this.stateDestroy();
            return;
        }

        for (let key of this.state.toRemove) {
            await this.wrapper.removeState(key);
        }
        for (let key of this.state.toPut.keys()) {
            await this.wrapper.putStateRaw(key, this.state.toPut.get(key));
        }
        for (let item of this.state.events) {
            await this.wrapper.dispatch(item);
        }
        this.stateDestroy();
    }

    protected stateDestroy = (): void => {
        if (!_.isNil(this.state)) {
            this.state.destroy();
            this.state = null;
        }
        this.wrapper = null;
    };

    // --------------------------------------------------------------------------
    //
    //  Public State Methods
    //
    // --------------------------------------------------------------------------

    protected getStateRawProxy = (item: string): Promise<string> => this.wrapper.getStateRaw(item);

    public async loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<IKeyValue>> {
        let items = await this.wrapper.loadKV(iterator);
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

    public async dispatch<T>(value: ITransportEvent<T>, isNeedValidate: boolean = true): Promise<void> {
        this.state.dispatch(value, isNeedValidate);
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
        this.stateCommitIfNeed(Transport.isCommandAsync(this.command) && !_.isNil(this.command.error));

        this.command = null;
        this.getStateRawProxy = null;
    }
}

import { TransformUtil, ValidateUtil, ObjectUtil, DateUtil } from '@ts-core/common/util';
import { ClassType } from 'class-transformer/ClassTransformer';
import { ChaincodeStub, Iterators, StateQueryResponse } from 'fabric-shim';
import * as _ from 'lodash';
import { ITransportFabricStub } from './ITransportFabricStub';
import { ITransportEvent } from '@ts-core/common/transport';
import { TransportFabricChaincodeReceiver } from '../TransportFabricChaincodeReceiver';
import { ITransportFabricCommandOptions } from '../../ITransportFabricCommandOptions';
import { TRANSPORT_CHAINCODE_EVENT } from '../../constants';

export class TransportFabricStub implements ITransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    private _stub: ChaincodeStub;
    private _transport: TransportFabricChaincodeReceiver;

    private _requestId: string;

    private _userId: string;
    private _userPublicKey: string;

    private eventsToDispatch: Array<ITransportEvent<any>>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(stub: ChaincodeStub, requestId: string, options: ITransportFabricCommandOptions, transport: TransportFabricChaincodeReceiver) {
        this._stub = stub;
        this._transport = transport;
        this._requestId = requestId;

        this.eventsToDispatch = new Array();

        if (!_.isNil(options)) {
            this._userId = options.userId;
            if (!_.isNil(options.signature)) {
                this._userPublicKey = options.signature.publicKey;
            }
        }
    }

    // --------------------------------------------------------------------------
    //
    //  Public State Methods
    //
    // --------------------------------------------------------------------------

    public async hasState(key: string): Promise<boolean> {
        return !_.isNil(await this.getStateRaw(key));
    }

    public async getState<U>(key: string, type: ClassType<U> = null, isNeedValidate: boolean = true): Promise<U> {
        let value = TransformUtil.toJSON(await this.getStateRaw(key));
        if (_.isNil(type) || _.isNil(value)) {
            return value;
        }
        let item: U = TransformUtil.toClass<U>(type, value);
        if (isNeedValidate) {
            ValidateUtil.validate(item);
        }
        return item;
    }

    public async getStateRaw(key: string): Promise<string> {
        let item = await this.stub.getState(key);
        return !_.isNil(item) && item.length > 0 ? item.toString(TransformUtil.ENCODING) : null;
    }

    public async putState<U>(
        key: string,
        value: U,
        isNeedValidate: boolean = true,
        isNeedTransform: boolean = true,
        isNeedSortKeys: boolean = true
    ): Promise<U> {
        if (isNeedValidate) {
            ValidateUtil.validate(value);
        }
        let item = value;
        if (isNeedTransform) {
            item = TransformUtil.fromClass(value);
        }
        if (isNeedSortKeys) {
            item = ObjectUtil.sortKeys(item, true);
        }
        await this.putStateRaw(key, TransformUtil.fromJSON(item));
        return item;
    }

    public async getStateByRange(startKey: string, endKey: string): Promise<Iterators.StateQueryIterator> {
        return this.stub.getStateByRange(startKey, endKey);
    }

    public async getStateByRangeWithPagination(
        startKey: string,
        endKey: string,
        pageSize: number,
        bookmark?: string
    ): Promise<StateQueryResponse<Iterators.StateQueryIterator>> {
        return this.stub.getStateByRangeWithPagination(startKey, endKey, pageSize, bookmark);
    }

    public async putStateRaw(key: string, item: string): Promise<void> {
        return this.stub.putState(key, Buffer.from(item, TransformUtil.ENCODING));
    }

    public async removeState(key: string): Promise<void> {
        return this.stub.deleteState(key);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Event Methods
    //
    // --------------------------------------------------------------------------

    public async dispatch<T>(value: ITransportEvent<T>, isNeedValidate: boolean = true): Promise<void> {
        if (isNeedValidate) {
            ValidateUtil.validate(value);
        }
        this.transport.dispatch(value);
        this.eventsToDispatch.push(value);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public dispatchEvents(): void {
        if (_.isEmpty(this.eventsToDispatch)) {
            return;
        }
        let items = TransformUtil.fromJSONMany(TransformUtil.fromClassMany(this.eventsToDispatch));
        this.stub.setEvent(TRANSPORT_CHAINCODE_EVENT, Buffer.from(JSON.stringify(items), TransformUtil.ENCODING));
    }

    public destroy(): void {
        this.dispatchEvents();
        this.eventsToDispatch = null;

        this._stub = null;
        this._transport = null;
    }

    // --------------------------------------------------------------------------
    //
    //  Private Properties
    //
    // --------------------------------------------------------------------------

    public get transport(): TransportFabricChaincodeReceiver {
        return this._transport;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Properties
    //
    // --------------------------------------------------------------------------

    public get requestId(): string {
        return this._requestId;
    }

    public get userId(): string {
        return this._userId;
    }

    public get userPublicKey(): string {
        return this._userPublicKey;
    }

    public get transactionHash(): string {
        return !_.isNil(this.stub) ? this.stub.getTxID() : null;
    }

    public get transactionDate(): Date {
        if (_.isNil(this.stub)) {
            return null;
        }
        let item = this.stub.getTxTimestamp() as any;
        if (ObjectUtil.hasOwnProperty(item, 'toDate')) {
            return item.toDate();
        }
        if (ObjectUtil.hasOwnProperties(item, ['seconds', 'nanos'])) {
            return new Date(item.seconds * DateUtil.MILISECONDS_SECOND + Math.round(item.nanos * DateUtil.MILISECONDS_NANOSECOND));
        }
        return null;
    }

    public get stub(): ChaincodeStub {
        return this._stub;
    }
}

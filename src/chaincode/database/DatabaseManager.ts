import { ILogger, LoggerWrapper } from '@ts-core/common/logger';
import * as _ from 'lodash';
import { Iterators } from 'fabric-shim';
import { IPaginationBookmark, IPageBookmark } from '@ts-core/common/dto';
import { TransformUtil } from '@ts-core/common/util';
import { ITransportFabricStub } from '../stub';

export class DatabaseManager extends LoggerWrapper {
    // --------------------------------------------------------------------------
    //
    //  Static Properties
    //
    // --------------------------------------------------------------------------

    public static LAST_KEY = '\ufff0';

    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    private _stub: ITransportFabricStub;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: ILogger, stub: ITransportFabricStub) {
        super(logger);
        this._stub = stub;
    }

    // --------------------------------------------------------------------------
    //
    //  Private Methods
    //
    // --------------------------------------------------------------------------

    private async loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<KeyValue>> {
        let items = [];
        while (true) {
            let response = await iterator.next();
            let item = response.value;
            if (!_.isNil(item) && !_.isNil(item.key)) {
                items.push({ key: item.key, value: !_.isNil(item.value) ? item.value.toString(TransformUtil.ENCODING) : null });
            }
            if (response.done) {
                await iterator.close();
                break;
            }
        }
        return items;
    }

    public getFinish(start: string): string {
        return start + DatabaseManager.LAST_KEY;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async getKV(start: string, finish?: string): Promise<Array<KeyValue>> {
        if (_.isNil(finish)) {
            finish = this.getFinish(start);
        }
        return this.loadKV(await this.stub.stub.getStateByRange(start, finish));
    }

    public async removeKV(start: string, finish?: string): Promise<void> {
        let kv = await this.getKV(start, finish);
        await Promise.all(kv.map(item => this.stub.removeState(item.key)));
        await Promise.all(kv.map(item => this.stub.removeState(item.value)));
    }

    public async getPaginatedKV(request: IPageBookmark, start: string, finish?: string): Promise<IPaginationBookmark<KeyValue>> {
        if (_.isNil(finish)) {
            finish = this.getFinish(start);
        }

        let response = await this.stub.stub.getStateByRangeWithPagination(start, finish, request.pageSize, request.pageBookmark);
        return {
            items: await this.loadKV(response.iterator),
            pageSize: request.pageSize,
            pageBookmark: response.metadata.bookmark,
            isAllLoaded: response.metadata.fetched_records_count < request.pageSize
        };
    }

    public async getKeys(start: string, finish?: string): Promise<Array<string>> {
        return (await this.getKV(start, finish)).map(item => item.key);
    }

    public async getValues(start: string, finish?: string): Promise<Array<string>> {
        return (await this.getKV(start, finish)).map(item => item.value);
    }

    public destroy(): void {
        super.destroy();
        if (this.isDestroyed) {
            return;
        }
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

export interface KeyValue {
    key: string;
    value?: string;
}

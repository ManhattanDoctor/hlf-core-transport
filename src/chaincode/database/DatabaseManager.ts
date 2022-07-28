import { ILogger, LoggerWrapper } from '@ts-core/common';
import * as _ from 'lodash';
import { IPaginationBookmark, IPageBookmark } from '@ts-core/common';
import { IKeyValue, ITransportFabricStub } from '../stub';

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

    public getFinish(start: string): string {
        return start + DatabaseManager.LAST_KEY;
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async getKV(start: string, finish?: string): Promise<Array<IKeyValue>> {
        if (_.isNil(finish)) {
            finish = this.getFinish(start);
        }
        return this.stub.loadKV(await this.stub.getStateByRange(start, finish));
    }

    public async removeKV(start: string, finish?: string): Promise<void> {
        let kv = await this.getKV(start, finish);
        await Promise.all(kv.map(item => this.stub.removeState(item.key)));
        await Promise.all(kv.map(item => this.stub.removeState(item.value)));
    }

    public async getPaginatedKV(request: IPageBookmark, start: string, finish?: string): Promise<IPaginationBookmark<IKeyValue>> {
        if (_.isNil(finish)) {
            finish = this.getFinish(start);
        }
        return this.stub.getPaginatedKV(request, start, finish);
    }

    public async getKeys(start: string, finish?: string): Promise<Array<string>> {
        return (await this.getKV(start, finish)).map(item => item.key);
    }

    public async getValues(start: string, finish?: string): Promise<Array<string>> {
        return (await this.getKV(start, finish)).map(item => item.value);
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }
        super.destroy();

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

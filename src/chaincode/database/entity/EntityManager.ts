import { ILogger } from '@ts-core/common';
import * as _ from 'lodash';
import { IPaginableBookmark, IPaginationBookmark, getUid } from '@ts-core/common';
import { DatabaseManager } from '../DatabaseManager';
import { TransformUtil } from '@ts-core/common';
import { IKeyValue, ITransportFabricStub } from '../../stub';
import { UID, IUIDable } from '@ts-core/common';

export abstract class EntityManager<U extends IUIDable> extends DatabaseManager {
    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: ILogger, stub: ITransportFabricStub) {
        super(logger, stub);
    }

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected getFindOptions(options?: IFindOptions): IFindOptions {
        if (_.isNil(options)) {
            options = {};
        }
        if (_.isNil(options.prefix)) {
            options.prefix = this.prefix;
        }
        if (_.isNil(options.transform)) {
            options.transform = TransformUtil.toJSON;
        }
        return options;
    }

    protected async parseFindResult<T = any>(result: Array<IKeyValue>, options: IFindOptions<T>): Promise<Array<T | string>> {
        let items = result.map(item => item.value);
        items = items.filter(item => !_.isNil(item));
        return _.isNil(options.transform) ? items : await Promise.all(items.map(item => options.transform(item)));
    }

    protected abstract serialize(item: U): Promise<any>;

    protected abstract deserialize(item: any, details?: Array<keyof U>): Promise<U>;

    public abstract loadDetails(item: U, details?: Array<keyof U>): Promise<void>;

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async get(item: UID, details?: Array<keyof U>): Promise<U> {
        return this.deserialize(await this.stub.getState(getUid(item)), details);
    }

    public async getMany(items: Array<UID>, details?: Array<keyof U>): Promise<Array<U>> {
        return Promise.all<U>(items.map(item => this.get(item, details)));
    }

    public async save(item: U): Promise<U> {
        await this.stub.putState(getUid(item), await this.serialize(item), false, false);
        this.log(`"${item.uid}" saved`);
        return item;
    }

    public async has(item: UID): Promise<boolean> {
        return !_.isNil(await this.stub.getState(getUid(item)));
    }

    public async saveMany(items: Array<U>): Promise<Array<U>> {
        return Promise.all<U>(items.map(item => this.save(item)));
    }

    public async saveIfNotExists(item: U): Promise<U> {
        if (await this.stub.hasState(getUid(item))) {
            return item;
        }
        return this.save(item);
    }

    public async saveManyIfNotExists(items: Array<U>): Promise<Array<U>> {
        return Promise.all<U>(items.map(item => this.saveIfNotExists(item)));
    }

    public async remove(item: UID): Promise<void> {
        await this.stub.removeState(getUid(item));
        this.log(`"${getUid(item)}" removed`);
    }

    public async removeMany(items: Array<UID>): Promise<void> {
        Promise.all(items.map(item => this.remove(item)));
    }

    // --------------------------------------------------------------------------
    //
    //  Find Methods
    //
    // --------------------------------------------------------------------------

    public async find(details?: Array<keyof U>, options?: IFindOptions): Promise<Array<U>> {
        options = this.getFindOptions(options);

        let result = await this.getKV(options.prefix, this.getFinish(options.prefix));
        let items = await this.parseFindResult(result, options);
        return Promise.all(items.map(item => this.deserialize(item, details)));
    }

    public async findPaginated(data: IPaginableBookmark<U>, options?: IFindOptions): Promise<IPaginationBookmark<U>> {
        options = this.getFindOptions(options);

        let result = await this.getPaginatedKV(data, options.prefix, this.getFinish(options.prefix));
        let items = await this.parseFindResult(result.items, options);

        return {
            pageSize: result.pageSize,
            isAllLoaded: result.isAllLoaded,
            pageBookmark: result.pageBookmark,
            items: await Promise.all(items.map(item => this.deserialize(item, data.details)))
        };
    }

    // --------------------------------------------------------------------------
    //
    //  Protected Properties
    //
    // --------------------------------------------------------------------------

    public abstract get prefix(): string;
}

export interface IFindOptions<T = any> {
    prefix?: string;
    transform?: (item: string) => T | Promise<T>;
}

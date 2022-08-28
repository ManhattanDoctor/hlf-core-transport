import { Logger, LoggerWrapper } from '@ts-core/common';
import * as _ from 'lodash';
import { TransportFabric } from '../TransportFabric';
import { TransportFabricConnectionSettingsFactory } from './TransportFabricConnectionSettingsFactory';

export class TransportFabricFactory extends LoggerWrapper {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected items: Map<string, TransportFabric>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: Logger, protected settings: TransportFabricConnectionSettingsFactory) {
        super(logger);
        this.items = new Map();
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async get(uid: string): Promise<TransportFabric> {
        let item = this.items.get(uid);
        if (_.isNil(item)) {
            item = new TransportFabric(this.logger, this.settings.get(uid));
            this.items.set(uid, item);
        }
        if (!item.isConnected) {
            await item.connect();
        }
        return item;
    }
}

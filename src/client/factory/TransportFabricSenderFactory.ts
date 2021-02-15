import { Logger, LoggerWrapper } from '@ts-core/common/logger';
import * as _ from 'lodash';
import { TransportFabricSender } from '../TransportFabricSender';
import { TransportFabricConnectionSettingsFactory } from './TransportFabricConnectionSettingsFactory';

export class TransportFabricSenderFactory extends LoggerWrapper {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected items: Map<string, TransportFabricSender>;

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

    public async get(uid: string): Promise<TransportFabricSender> {
        let item = this.items.get(uid);
        if (_.isNil(item)) {
            item = new TransportFabricSender(this.logger, this.settings.get(uid));
            this.items.set(uid, item);
        }
        if (!item.isConnected) {
            await item.connect();
        }
        return item;
    }
}

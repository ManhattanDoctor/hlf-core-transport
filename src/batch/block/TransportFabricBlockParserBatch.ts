import * as _ from 'lodash';
import { FabricApiClient, IFabricBlock } from '@hlf-core/api';
import { IDestroyable, TransformUtil } from '@ts-core/common';
import { ITransportFabricBlockBatch } from './ITransportFabricBlockBatch';
import { ITransportFabricEvent } from '../../block/ITransportFabricEvent';
import { TransportFabricBlockParser } from '../../block/TransportFabricBlockParser';
import { ITransportFabricTransactionBatch } from './ITransportFabricTransactionBatch';
import { TransportFabricResponsePayload, TRANSPORT_FABRIC_COMMAND_BATCH_NAME } from '@hlf-core/transport-common';

export class TransportFabricBlockParserBatch extends TransportFabricBlockParser<ITransportFabricTransactionBatch, ITransportFabricEvent, ITransportFabricBlockBatch> implements IDestroyable {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static getBatchTransaction(item: ITransportFabricBlockBatch): ITransportFabricTransactionBatch {
        return _.find(item.transactions, item => !_.isNil(item.request) && item.request.name === TRANSPORT_FABRIC_COMMAND_BATCH_NAME);
    }

    public static getSucceedBatchTransaction(item: ITransportFabricBlockBatch): ITransportFabricTransactionBatch {
        return _.find(item.transactions, item => TransportFabricBlockParser.isTransactionSucceed(item) && !_.isNil(item.request) && item.request.name === TRANSPORT_FABRIC_COMMAND_BATCH_NAME);
    }

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(protected api: FabricApiClient) {
        super();
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async parse(block: IFabricBlock): Promise<ITransportFabricBlockBatch> {
        let item = await super.parse(block);
        let batch = TransportFabricBlockParserBatch.getSucceedBatchTransaction(item);
        if (_.isNil(batch)) {
            item.events = [];
            item.transactions = [];
            return item;
        }

        let events = item.events = _.uniqBy(item.events, 'uid');
        let payload = TransformUtil.toClass(TransportFabricResponsePayload, batch.response);
        let transactions = item.transactions = [batch];

        for (let hash in payload.response) {
            let original = await this.api.qsccContract.getTransaction(hash);
            let blockReceived = await this.api.qsccContract.getBlockByTransactionId(hash);

            let transaction = this.parseTransaction(original);
            transaction.response = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
            transaction.blockReceived = blockReceived.number;
            transactions.push(transaction);
        }
        TransportFabricBlockParser.checkEventsTransaction(events, transactions);
        return item;
    }

    public destroy(): void {
        this.api = null;
    }
}

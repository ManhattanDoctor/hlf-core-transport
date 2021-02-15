import * as _ from 'lodash';
import { FabricApiClient, FabricTransactionValidationCode, IFabricBlock } from '@hlf-core/api';
import { IDestroyable } from '@ts-core/common';
import { ExtendedError } from '@ts-core/common/error';
import { TransformUtil } from '@ts-core/common/util';
import { ITransportFabricBlockBatch } from './ITransportFabricBlockBatch';
import { ITransportFabricEvent, TransportFabricBlockParser } from '../../block';
import { ITransportFabricTransactionBatch } from './ITransportFabricTransactionBatch';
import { TRANSPORT_FABRIC_COMMAND_BATCH_NAME } from '../../../constants';
import { TransportFabricResponsePayload } from '../../../TransportFabricResponsePayload';

export class TransportFabricBlockParserBatch
    extends TransportFabricBlockParser<ITransportFabricTransactionBatch, ITransportFabricEvent, ITransportFabricBlockBatch>
    implements IDestroyable {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static getBatchTransaction(block: ITransportFabricBlockBatch): ITransportFabricTransactionBatch {
        return _.find(block.transactions, item => !_.isNil(item.request) && item.request.name === TRANSPORT_FABRIC_COMMAND_BATCH_NAME);
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
        let batchTransaction = TransportFabricBlockParserBatch.getBatchTransaction(item);

        item.isBatch = !_.isNil(batchTransaction) && !_.isNil(batchTransaction.response);
        if (!item.isBatch) {
            item.events = [];
            item.transactions = [];
            return item;
        }

        let payload = TransformUtil.toClass(TransportFabricResponsePayload, batchTransaction.response);
        let transactions = (item.transactions = [batchTransaction]);
        for (let hash in payload.response) {
            let original = await this.api.getTransaction(hash);
            let blockMined = await this.api.getBlockByTxID(hash);

            let transaction = this.parseTransaction(original);
            transaction.blockMined = blockMined.number;

            transaction.response = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
            if (transaction.validationCode === FabricTransactionValidationCode.VALID && ExtendedError.instanceOf(transaction.response)) {
                transaction.validationCode = FabricTransactionValidationCode.INVALID_OTHER_REASON;
            }
            transactions.push(transaction);
        }
        TransportFabricBlockParser.checkEventsCode(transactions, item.events);
        return item;
    }

    public destroy(): void {
        this.api = null;
    }
}

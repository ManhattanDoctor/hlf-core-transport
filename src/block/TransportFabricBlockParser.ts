import { BlockData } from 'fabric-common';
import { ITransportFabricBlock } from './ITransportFabricBlock';
import { ITransportFabricTransaction } from './ITransportFabricTransaction';
import { TransformUtil, ObjectUtil, ExtendedError } from '@ts-core/common';
import { FabricTransactionValidationCode, IFabricBlock, IFabricTransaction } from '@hlf-core/api';
import { ITransportFabricEvent } from './ITransportFabricEvent';
import { TRANSPORT_CHAINCODE_EVENT, TRANSPORT_FABRIC_METHOD } from '@hlf-core/transport-common';
import * as _ from 'lodash';

export class TransportFabricBlockParser<
    U extends ITransportFabricTransaction = ITransportFabricTransaction,
    V extends ITransportFabricEvent = ITransportFabricEvent,
    T extends ITransportFabricBlock<U, V> = ITransportFabricBlock<U, V>
> {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    public static checkEventsCode<U extends ITransportFabricTransaction, V extends ITransportFabricEvent>(transactions: Array<U>, events: Array<V>): void {
        for (let event of events) {
            if (_.isNil(event.transactionHash)) {
                continue;
            }
            let transaction = _.find(transactions, item => item.hash === event.transactionHash);
            if (!_.isNil(transaction)) {
                event.transactionValidationCode = transaction.validationCode;
            }
        }
    }

    protected static createEvent<V extends ITransportFabricEvent>(uid: string, name: string, header: any, chaincode: string, data: string, requestId: string): V {
        return { channel: header.channel_id, transactionHash: header.tx_id, date: new Date(header.timestamp), uid, name, data, chaincode, requestId } as V;
    }

    public static isTransactionError(item: ITransportFabricTransaction): boolean {
        return !_.isNil(item) && ExtendedError.instanceOf(item.response);
    }

    public static isTransactionValid(item: ITransportFabricTransaction): boolean {
        return !_.isNil(item) && item.validationCode === FabricTransactionValidationCode.VALID;
    }

    public static isTransactionSucceed(item: ITransportFabricTransaction): boolean {
        return TransportFabricBlockParser.isTransactionValid(item) && !TransportFabricBlockParser.isTransactionError(item);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async parse(block: IFabricBlock): Promise<T> {
        let item = {} as any;
        item.hash = block.hash;
        item.date = block.date;
        item.number = block.number;

        let events: Array<V> = (item.events = []);
        let transactions: Array<U> = (item.transactions = []);
        if (_.isNil(block.data) || _.isEmpty(block.data.data)) {
            return;
        }

        let metadata = block.metadata.metadata;
        let validationCodes = _.isArray(metadata) && metadata.length >= 3 ? metadata[2] : [];
        for (let i = 0; i < block.data.data.length; i++) {
            let transaction = this.parseTransactionBlockData(block.data.data[i]);
            if (!_.isNil(transaction)) {
                transaction.validationCode = validationCodes[i];
                transactions.push(transaction);
            }
            let requestId = !_.isNil(transaction.request) ? transaction.request.id : null;
            let event = this.parseEventBlockData(block.data.data[i], requestId);
            if (!_.isEmpty(event)) {
                events.push(...event);
            }
        }
        TransportFabricBlockParser.checkEventsCode(transactions, events);
        return item;
    }

    public parseTransaction(data: IFabricTransaction): U {
        let item = this.parseTransactionBlockData(data.transactionEnvelope);
        item.validationCode = data.validationCode;
        return item;
    }

    // --------------------------------------------------------------------------
    //
    //  Transaction Methods
    //
    // --------------------------------------------------------------------------

    protected parseTransactionBlockData(data: BlockData): U {
        if (_.isNil(data) || _.isNil(data.payload) || _.isNil(data.payload.header) || _.isNil(data.payload.header.channel_header)) {
            return null;
        }

        let header = data.payload.header.channel_header;

        let item = {} as any;
        item.hash = header.tx_id;
        item.date = new Date(header.timestamp);
        item.channel = header.channel_id;

        if (!_.isNil(data.payload.data) && !_.isEmpty(data.payload.data.actions)) {
            for (let action of data.payload.data.actions) {
                this.parseTransactionBlockAction(item, action);
            }
        }
        return item;
    }

    protected parseTransactionBlockAction(transaction: U, action: any): void {
        if (
            _.isNil(action.payload) ||
            _.isNil(action.payload.chaincode_proposal_payload) ||
            _.isNil(action.payload.chaincode_proposal_payload.input) ||
            _.isNil(action.payload.chaincode_proposal_payload.input.chaincode_spec)
        ) {
            return;
        }

        let chaincode = action.payload.chaincode_proposal_payload.input.chaincode_spec;
        if (_.isNil(chaincode.input) || _.isEmpty(chaincode.input.args) || chaincode.input.args.length !== 2) {
            return;
        }
        let method = chaincode.input.args[0].toString();
        if (method !== TRANSPORT_FABRIC_METHOD) {
            return;
        }

        transaction.request = TransformUtil.toJSON(chaincode.input.args[1].toString());
        transaction.chaincode = chaincode.chaincode_id;

        if (
            _.isNil(action.payload.action) ||
            _.isNil(action.payload.action.proposal_response_payload) ||
            _.isNil(action.payload.action.proposal_response_payload.extension)
        ) {
            return;
        }

        let extension = action.payload.action.proposal_response_payload.extension;
        if (!_.isNil(extension.chaincode_id)) {
            transaction.chaincode = extension.chaincode_id;
        }

        let response = extension.response;
        if (_.isNil(response) || _.isNil(response.payload)) {
            return;
        }
        transaction.response = TransformUtil.toJSON(response.payload.toString());
    }

    // --------------------------------------------------------------------------
    //
    //  Event Methods
    //
    // --------------------------------------------------------------------------

    protected parseEventBlockData(data: BlockData, requestId: string): Array<V> {
        if (_.isNil(data) || _.isNil(data.payload) || _.isNil(data.payload.header) || _.isNil(data.payload.header.channel_header)) {
            return [];
        }

        let items = [];
        if (!_.isNil(data.payload.data) && !_.isEmpty(data.payload.data.actions)) {
            for (let action of data.payload.data.actions) {
                items.push(...this.parseEventBlockAction(data.payload.header.channel_header, action, requestId));
            }
        }
        return items;
    }

    protected parseEventBlockAction(header: any, action: any, requestId: string): Array<V> {
        if (
            _.isNil(action.payload.action) ||
            _.isNil(action.payload.action.proposal_response_payload) ||
            _.isNil(action.payload.action.proposal_response_payload.extension) ||
            _.isNil(action.payload.action.proposal_response_payload.extension.events)
        ) {
            return [];
        }

        let data = action.payload.action.proposal_response_payload.extension.events;
        return this.parseEvents(data.event_name, header, data.chaincode_id, data.payload.toString(), requestId);
    }

    protected parseEvents<V extends ITransportFabricEvent>(name: string, header: any, chaincode: string, payload: any, requestId: string): Array<V> {
        let items: Array<V> = name === TRANSPORT_CHAINCODE_EVENT ? this.parseChaincodeEvents(name, header, chaincode, payload, requestId) : this.parseNotChaincodeEvents(name, header, chaincode, payload, requestId);
        return items.filter(item => !_.isEmpty(item.name));
    }

    protected parseNotChaincodeEvents<V extends ITransportFabricEvent>(name: string, header: any, chaincode: string, payload: any, requestId: string): Array<V> {
        if (ObjectUtil.isJSON(payload)) {
            payload = TransformUtil.toJSON(payload);
            if (ObjectUtil.instanceOf(payload, ['data', 'name']) || payload.name === name) {
                payload = payload.data;
            }
        }
        return [TransportFabricBlockParser.createEvent(null, name, header, chaincode, payload, requestId)];
    }

    protected parseChaincodeEvents<V extends ITransportFabricEvent>(name: string, header: any, chaincode: string, payload: any, requestId: string): Array<V> {
        return JSON.parse(payload).map(item => TransportFabricBlockParser.createEvent(item.uid, item.name, header, chaincode, item.data, requestId));
    }
}

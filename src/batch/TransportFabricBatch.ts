import { ExtendedError, ITransportCommand, TransformUtil } from '@ts-core/common';
import * as _ from 'lodash';
import { TransportFabricBlockParserBatch } from './block/TransportFabricBlockParserBatch';
import { IFabricBlock } from '@hlf-core/api';
import { ITransportFabricConnectionSettings } from '../ITransportFabricConnectionSettings';
import { TransportFabric } from '../TransportFabric';
import { ITransportFabricCommandOptions, TransportFabricResponsePayload } from '@hlf-core/transport-common';
import { TransportFabricBlockParser } from '../block';

export class TransportFabricBatch<T extends ITransportFabricConnectionSettings = ITransportFabricConnectionSettings> extends TransportFabric<T> {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected isFirstBlockEvent: boolean = true;

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected async requestSend<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions, isNeedReply: boolean): Promise<void> {
        if (this.isCommandReadonly(command)) {
            return super.requestSend(command, options, isNeedReply);
        }
        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send "${command.name}" command request: transport is not connected`);
        }

        let request = this.createRequestOptions(command, options, isNeedReply);
        // this.transactionSend(this.api.contract.createTransaction(request.method), command, request).catch(error => this.parseTransactionError(command, error));

        try {
            await this.transactionSend(this.api.contract.createTransaction(request.method), command, request);
        } catch (error) {
            this.parseTransactionError(command, error);
        }
    }

    protected async blockEventCallback(block: IFabricBlock): Promise<void> {
        await super.blockEventCallback(block);
        if (this.isFirstBlockEvent) {
            this.isFirstBlockEvent = false;
            return;
        }

        let parser = new TransportFabricBlockParserBatch(this.api);
        let parsedBlock = await parser.parse(block);
        let batch = TransportFabricBlockParserBatch.getBatchTransaction(parsedBlock);
        if (_.isNil(batch) || !TransportFabricBlockParser.isTransactionSucceed(batch)) {
            return;
        }
        let payload = TransformUtil.toClass(TransportFabricResponsePayload, batch.response);
        for (let hash in payload.response) {
            let item = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
            this.responseMessageReceived(item.id, TransformUtil.fromClassBuffer(item));
        }
    }
}

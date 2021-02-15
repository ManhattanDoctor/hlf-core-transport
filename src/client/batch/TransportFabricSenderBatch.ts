import { ExtendedError } from '@ts-core/common/error';
import { ITransportCommand } from '@ts-core/common/transport';
import * as _ from 'lodash';
import { TransformUtil } from '@ts-core/common/util';
import { TransportFabricBlockParserBatch } from './block/TransportFabricBlockParserBatch';
import { IFabricBlock } from '@hlf-core/api';
import { ITransportFabricConnectionSettings } from '../ITransportFabricConnectionSettings';
import { TransportFabricSender } from '../TransportFabricSender';
import { ITransportFabricCommandOptions } from '../../ITransportFabricCommandOptions';
import { TransportFabricResponsePayload } from '../../TransportFabricResponsePayload';

export class TransportFabricSenderBatch<T extends ITransportFabricConnectionSettings = ITransportFabricConnectionSettings> extends TransportFabricSender<T> {
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

        try {
            let request = this.createRequestOptions(command, options, isNeedReply);
            await this.transactionSend(this.api.contract.createTransaction(request.method), command, request);
        } catch (error) {
            this.parseTransactionError(command, error);
        }
    }

    protected async blockEventCallback(error: Error, rawBlock: IFabricBlock): Promise<void> {
        await super.blockEventCallback(error, rawBlock);
        if (!_.isNil(error)) {
            return;
        }

        if (this.isFirstBlockEvent) {
            this.isFirstBlockEvent = false;
            return;
        }

        let parser = new TransportFabricBlockParserBatch(this.api);
        let parsedBlock = await parser.parse(rawBlock);
        if (!parsedBlock.isBatch) {
            return;
        }
        let batchTransaction = TransportFabricBlockParserBatch.getBatchTransaction(parsedBlock);
        let payload = TransformUtil.toClass(TransportFabricResponsePayload, batchTransaction.response);
        for (let hash in payload.response) {
            let item = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
            this.responseMessageReceived(item.id, TransformUtil.fromClassBuffer(item));
        }
    }
}

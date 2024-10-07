import { ExtendedError, ITransportCommand, TransformUtil } from '@ts-core/common';
import * as _ from 'lodash';
import { TransportFabricBlockParserBatch } from './block/TransportFabricBlockParserBatch';
import { IFabricBlock } from '@hlf-core/api';
import { ITransportFabricConnectionSettings } from '../ITransportFabricConnectionSettings';
import { TransportFabric } from '../TransportFabric';
import { ITransportFabricCommandOptions, TRANSPORT_FABRIC_METHOD, TransportFabricRequestPayload, TransportFabricResponsePayload } from '@hlf-core/transport-common';
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

    protected async commandRequestExecute<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions, isNeedReply: boolean): Promise<void> {
        if (this.isCommandReadonly(command)) {
            return super.commandRequestExecute(command, options, isNeedReply);
        }

        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send "${command.name}" command request: transport is not connected`);
        }

        let payload = this.createRequestPayload(command, options, isNeedReply);
        TransportFabricRequestPayload.clear(payload);

        return this.transactionSend(this.api.contract.createTransaction(TRANSPORT_FABRIC_METHOD), command, payload);
    }

    protected async blockEventCallback(block: IFabricBlock): Promise<void> {
        await super.blockEventCallback(block);
        if (this.isFirstBlockEvent) {
            this.isFirstBlockEvent = false;
            return;
        }

        let parser = new TransportFabricBlockParserBatch(this.api);
        let parsedBlock = await parser.parse(block);
        let batch = TransportFabricBlockParserBatch.getSucceedBatchTransaction(parsedBlock);
        if (_.isNil(batch)) {
            return;
        }
        let payload = TransformUtil.toClass(TransportFabricResponsePayload, batch.response);
        for (let hash in payload.response) {
            let item = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
            this.responseMessageReceived(item.id, TransformUtil.fromClassBuffer(item));
        }
    }
}

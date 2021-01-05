import { ITransportCommand, ITransportReceiver, ITransportSettings } from '@ts-core/common/transport';
import { ChaincodeStub } from 'fabric-shim';
import * as _ from 'lodash';

import { ITransportCryptoManager } from '@ts-core/common/transport/crypto';
import { ExtendedError } from '@ts-core/common/error';
import { TransportFabricStubWrapper } from './TransportFabricStubWrapper';
import { TransportFabricStubBatch } from './TransportFabricStubBatch';
import { DateUtil, TransformUtil } from '@ts-core/common/util';
import { ITransportFabricChaincodeBatchDtoResponse } from './ITransportFabricChaincodeBatchDtoResponse';
import { DatabaseManager } from '../database';
import { TransportFabricChaincodeReceiver } from '../TransportFabricChaincodeReceiver';
import { TransportFabricRequestPayload } from '../../TransportFabricRequestPayload';
import { ITransportFabricStub } from '../stub';
import { ITransportFabricRequestPayload } from '../../ITransportFabricRequestPayload';
import { TRANSPORT_FABRIC_COMMAND_BATCH_NAME } from '../../constants';
import { TransportFabricResponsePayload } from '../../TransportFabricResponsePayload';

export class TransportFabricChaincodeReceiverBatch extends TransportFabricChaincodeReceiver {
    // --------------------------------------------------------------------------
    //
    //  Constants
    //
    // --------------------------------------------------------------------------

    private static PREFIX = 'COMMAND_BATCH';

    // --------------------------------------------------------------------------
    //
    //  Recevie Message Methods
    //
    // --------------------------------------------------------------------------

    protected async executeCommand<U>(
        stubOriginal: ChaincodeStub,
        payload: TransportFabricRequestPayload<U>,
        stub: ITransportFabricStub,
        command: ITransportCommand<U>
    ): Promise<void> {
        if (payload.isReadonly) {
            return super.executeCommand(stubOriginal, payload, stub, command);
        }
        this.complete(command, this.isCommandBatch(payload) ? await this.executeBatch(stubOriginal, stub) : await this.addToBatch(payload, stub, command));
    }

    protected async executeBatch<U>(stubOriginal: ChaincodeStub, stub: ITransportFabricStub): Promise<ITransportFabricChaincodeBatchDtoResponse> {
        let database = new DatabaseManager(this.logger, stub);
        let items = await database.getKV(TransportFabricChaincodeReceiverBatch.PREFIX);

        let wrapper = new TransportFabricStubWrapper(stubOriginal);
        let response = {} as ITransportFabricChaincodeBatchDtoResponse;

        for (let item of items) {
            let result = {};
            try {
                result = await this.executeBatchedCommand(
                    item.key,
                    stubOriginal,
                    wrapper,
                    TransformUtil.toClass<ITransportFabricRequestPayload<U>>(TransportFabricRequestPayload, TransformUtil.toJSON(item.value))
                );
            } catch (error) {
                error = ExtendedError.create(error);
                this.error(`Unable to execute batched command: ${error.message}`);
                result = TransformUtil.fromClass(error);
            }
            response[this.batchKeyToHash(item.key)] = result;
            await stub.removeState(item.key);
        }
        wrapper.destroy();
        console.log(response);
        return response;
    }

    protected async executeBatchedCommand<U>(
        batchKey: string,
        chaincodeStub: ChaincodeStub,
        wrapper: TransportFabricStubWrapper,
        payload: ITransportFabricRequestPayload<U>
    ): Promise<TransportFabricResponsePayload<U>> {
        let batchStub = new TransportFabricStubBatch(this.batchKeyToHash(batchKey), this.batchKeyToDate(batchKey), wrapper, payload);
        let command = this.createCommand(payload, batchStub);
        let request = this.checkRequestStorage(payload, batchStub, command);
        await super.executeCommand(chaincodeStub, payload, batchStub, command);
        batchStub.destroy();
        return request.handler.promise;
    }

    protected async addToBatch<U>(payload: TransportFabricRequestPayload<U>, stub: ITransportFabricStub, command: ITransportCommand<U>): Promise<string> {
        await stub.putState(this.toBatchKey(stub.transactionDate, stub.transactionHash, command), payload);
        return stub.transactionHash;
    }

    protected isCommandBatch<U>(payload: TransportFabricRequestPayload<U>): boolean {
        return payload.name === TRANSPORT_FABRIC_COMMAND_BATCH_NAME;
    }

    // --------------------------------------------------------------------------
    //
    //  Batch Key Methods
    //
    // --------------------------------------------------------------------------

    protected batchKeyToHash(item: string): string {
        return item.split('/')[2];
    }
    protected batchKeyToDate(item: string): Date {
        return DateUtil.getDate(Number(item.split('/')[1]));
    }

    protected toBatchKey<U>(date: Date, hash: string, command: ITransportCommand<U>): string {
        let time = date.getTime();
        return `${TransportFabricChaincodeReceiverBatch.PREFIX}/${_.padStart(time.toString(), 14, '0')}/${hash}/${command.id}`;
    }
}

export interface ITransportFabricChaincodeBatchSettings extends ITransportSettings {
    cryptoManagers?: Array<ITransportCryptoManager>;
    nonSignedCommands?: Array<string>;

    stubFactory?: <U>(stub: ChaincodeStub, payload: TransportFabricRequestPayload<U>, transport: TransportFabricChaincodeReceiver) => ITransportFabricStub;
    commandFactory?: <U>(payload: ITransportFabricRequestPayload<U>) => ITransportCommand<U>;
}

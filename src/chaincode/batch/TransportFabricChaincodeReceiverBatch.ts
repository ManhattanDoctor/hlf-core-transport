import { ITransportCommand, ITransportSettings } from '@ts-core/common/transport';
import { ChaincodeStub } from 'fabric-shim';
import * as _ from 'lodash';
import { ITransportCryptoManager } from '@ts-core/common/transport/crypto';
import { ExtendedError } from '@ts-core/common/error';
import { TransportFabricStubWrapper } from './TransportFabricStubWrapper';
import { TransportFabricStubBatch } from './TransportFabricStubBatch';
import { TransformUtil } from '@ts-core/common/util';
import { ITransportFabricChaincodeBatchDtoResponse } from './ITransportFabricChaincodeBatchDtoResponse';
import { TransportFabricChaincodeReceiver } from '../TransportFabricChaincodeReceiver';
import { TransportFabricRequestPayload } from '../../TransportFabricRequestPayload';
import { ITransportFabricStub } from '../stub';
import { DatabaseManager } from '../database';
import { ITransportFabricRequestPayload } from '../../ITransportFabricRequestPayload';
import { TRANSPORT_FABRIC_COMMAND_BATCH_NAME } from '../../constants';

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

    protected async executeCommand<U>(payload: TransportFabricRequestPayload<U>, stub: ITransportFabricStub, command: ITransportCommand<U>): Promise<void> {
        if (payload.isReadonly) {
            return super.executeCommand(payload, stub, command);
        }
        this.complete(command, this.isCommandBatch(payload) ? await this.executeBatch(stub) : await this.addToBatch(payload, stub, command));
    }

    protected async executeBatch<U>(stub: ITransportFabricStub): Promise<ITransportFabricChaincodeBatchDtoResponse> {
        let database = new DatabaseManager(this.logger, stub);
        let response = {} as ITransportFabricChaincodeBatchDtoResponse;

        for (let item of await database.getKV(TransportFabricChaincodeReceiverBatch.PREFIX)) {
            let result = null;

            try {
                let payload = TransformUtil.toClass<ITransportFabricRequestPayload<U>>(TransportFabricRequestPayload, TransformUtil.toJSON(item.value));
                let batchStub = new TransportFabricStubBatch(new TransportFabricStubWrapper(stub.stub), payload.id, payload.options, this);
                let command = this.createCommand(payload, batchStub);
                let request = this.checkRequestStorage(payload, batchStub, command);
                super.executeCommand(payload, batchStub, command);
                result = (await request.handler.promise).response;
            } catch (error) {
                error = ExtendedError.create(error);
                this.warn(`Error to execute batched command: ${error.message}`);
                result = TransformUtil.fromClass(error);
            }
            response[this.fromBatchKey(item.key)] = result;
        }
        return response;
    }

    protected async addToBatch<U>(payload: TransportFabricRequestPayload<U>, stub: ITransportFabricStub, command: ITransportCommand<U>): Promise<string> {
        await stub.putState(this.toBatchKey(stub.transactionDate, stub.transactionHash, command), payload);
        return stub.transactionHash;
    }

    protected toBatchKey<U>(date: Date, hash: string, command: ITransportCommand<U>): string {
        let time = date.getTime();
        return `${TransportFabricChaincodeReceiverBatch.PREFIX}/${_.padStart(time.toString(), 14, '0')}/${hash}/${command.id}`;
    }

    protected fromBatchKey(item: string): string {
        let items = item.split('/');
        if (items.length < 3) {
            throw new Error(`Invalid batch key "${item}"`);
        }
        return item.split('/')[2];
    }

    protected isCommandBatch<U>(payload: TransportFabricRequestPayload<U>): boolean {
        return payload.name === TRANSPORT_FABRIC_COMMAND_BATCH_NAME;
    }
}

export interface ITransportFabricChaincodeBatchSettings extends ITransportSettings {
    cryptoManagers?: Array<ITransportCryptoManager>;
    nonSignedCommands?: Array<string>;

    stubFactory?: <U>(stub: ChaincodeStub, payload: TransportFabricRequestPayload<U>, transport: TransportFabricChaincodeReceiver) => ITransportFabricStub;
    commandFactory?: <U>(payload: ITransportFabricRequestPayload<U>) => ITransportCommand<U>;
}

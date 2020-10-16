import { ExtendedError } from '@ts-core/common/error';
import { ILogger } from '@ts-core/common/logger';
import { PromiseHandler } from '@ts-core/common/promise';
import { Observable } from 'rxjs';
import {
    ITransportCommand,
    ITransportEvent,
    ITransportRequestStorage,
    Transport,
    TransportLogType,
    ITransportSettings,
    ITransportCommandOptions,
    ITransportCommandAsync,
    TransportCommandAsync,
    ITransportReceiver
} from '@ts-core/common/transport';
import { TransportWaitExceedError } from '@ts-core/common/transport/error';
import { DateUtil, ObjectUtil } from '@ts-core/common/util';
import { ChaincodeStub } from 'fabric-shim';
import * as _ from 'lodash';
import { TransportFabricResponsePayload } from '../TransportFabricResponsePayload';
import { TransportFabricRequestPayload } from '../TransportFabricRequestPayload';
import { ISignature } from '@ts-core/common/crypto';
import { IDestroyable } from '@ts-core/common/IDestroyable';
import { ITransportCryptoManager } from '@ts-core/common/transport/crypto';
import { ITransportFabricRequestPayload } from '../ITransportFabricRequestPayload';
import { ITransportFabricStub, TransportFabricStub } from './stub';
import { TransportFabricChaincodeCommandWrapper } from './TransportFabricChaincodeCommandWrapper';
import { ITransportFabricResponsePayload } from '../ITransportFabricResponsePayload';

export class TransportFabricChaincodeReceiver extends Transport<ITransportFabricChaincodeSettings> {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected defaultCreateStubFactory = <U>(stub: ChaincodeStub, payload: TransportFabricRequestPayload<U>, transport: ITransportReceiver) =>
        new TransportFabricStub(stub, payload.id, payload.options, transport);
    protected defaultCreateCommandFactory = <U>(item: ITransportFabricRequestPayload<U>) => new TransportCommandAsync(item.name, item.request, item.id);

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: ILogger, settings?: ITransportFabricChaincodeSettings) {
        super(logger, settings);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async invoke<U = any, V = any>(chaincode: ChaincodeStub): Promise<ITransportFabricResponsePayload<V>> {
        let command: ITransportCommand<U> = null;
        let stub: ITransportFabricStub = null;
        let payload: TransportFabricRequestPayload<U> = null;
        try {
            payload = TransportFabricRequestPayload.parse(chaincode);
            stub = this.createStub(chaincode, payload, this);
            command = this.createCommand(stub, payload);
            if (!this.isNonSignedCommand(command)) {
                await this.validateSignature(command, payload.options.signature);
            }
        } catch (error) {
            error = ExtendedError.create(error);
            this.warn(`Unable to create command: ${error.message}`);
            return Promise.resolve(TransportFabricResponsePayload.fromError(!_.isNil(payload) ? payload.id : null, error));
        }

        this.logCommand(command, TransportLogType.REQUEST_RECEIVED);
        let request = this.checkRequestStorage(command, payload);

        if (this.isRequestExpired(request)) {
            this.logCommand(command, TransportLogType.REQUEST_EXPIRED);
            this.warn(`Received "${command.name}" command with already expired timeout: ignore`);
            this.requests.delete(command.id);
            return;
        }
        await this.executeCommand(payload, command);
        return request.handler.promise;
    }

    public complete<U, V>(command: ITransportCommand<U>, result?: V | Error): void {
        let request = this.requests.get(command.id) as ITransportFabricRequestStorage;
        this.requests.delete(command.id);

        if (_.isNil(request)) {
            this.error(`Unable to complete command "${command.name}", probably command was already completed`);
            return;
        }

        if (this.isRequestExpired(request)) {
            this.logCommand(command, TransportLogType.RESPONSE_EXPIRED);
            let error = new ExtendedError(`Unable to completed "${command.name}" command: timeout is expired`);
            this.warn(error.message);
            request.handler.resolve(TransportFabricResponsePayload.fromError(command.id, error));
            return;
        }

        if (this.isCommandAsync(command)) {
            command.response(result);
        }

        this.logCommand(command, request.isNeedReply ? TransportLogType.RESPONSE_SENDED : TransportLogType.RESPONSE_NO_REPLY);
        request.handler.resolve(this.createResponsePayload(command));
        if (IDestroyable.instanceOf(command)) {
            command.destroy();
        }
    }

    public wait<U>(command: ITransportCommand<U>): void {
        let request = this.requests.get(command.id) as ITransportFabricRequestStorage;
        if (_.isNil(request)) {
            throw new ExtendedError(`Unable to wait "${command.name}" command: can't find request details`);
        }

        if (this.isRequestWaitExpired(request)) {
            this.complete(command, new TransportWaitExceedError(command));
            return;
        }

        this.waitSend(command);
    }

    public dispatch<T>(event: ITransportEvent<T>): void {
        this.eventSend(event);
    }

    public getDispatcher<T>(name: string): Observable<T> {
        throw new ExtendedError(`Method is not supported, use TransportFabricSender instead`);
    }

    public send<U>(command: ITransportCommand<U>, options?: ITransportCommandOptions): void {
        throw new ExtendedError(`Method is not supported, use TransportFabricSender instead`);
    }

    public sendListen<U, V>(command: ITransportCommandAsync<U, V>, options?: ITransportCommandOptions): Promise<V> {
        throw new ExtendedError(`Method is not supported, use TransportFabricSender instead`);
    }

    public destroy(): void {
        super.destroy();

        this.requests.forEach((item: ITransportFabricRequestStorage) => item.handler.reject(new ExtendedError(`Chaincode destroyed`)));
        this.requests.clear();
        this.requests = null;
    }

    // --------------------------------------------------------------------------
    //
    //  Send Methods
    //
    // --------------------------------------------------------------------------

    protected async eventSend<U>(event: ITransportEvent<U>): Promise<void> {
        this.logEvent(event, TransportLogType.EVENT_SENDED);
    }

    protected async waitSend<U>(command: ITransportCommand<U>): Promise<void> {
        this.logCommand(command, TransportLogType.RESPONSE_WAIT);
    }

    // --------------------------------------------------------------------------
    //
    //  Recevie Message Methods
    //
    // --------------------------------------------------------------------------

    protected checkRequestStorage<U>(command: ITransportCommand<U>, payload: TransportFabricRequestPayload<U>): ITransportFabricRequestStorage<U> {
        let item = this.requests.get(command.id) as ITransportFabricRequestStorage;
        if (!_.isNil(item)) {
            item.waitCount++;
        } else {
            item = {
                waitCount: 0,
                isNeedReply: payload.isNeedReply,
                expiredDate: payload.isNeedReply ? DateUtil.getDate(Date.now() + this.getCommandTimeoutDelay(command, payload.options)) : null,
                handler: PromiseHandler.create<TransportFabricResponsePayload<U>, ExtendedError>(),
                payload
            };
            item = ObjectUtil.copyProperties(payload.options, item);
            this.requests.set(command.id, item);
        }
        return item;
    }

    protected isNonSignedCommand<U>(command: ITransportCommand<U>): boolean {
        return !_.isEmpty(this.getSettingsValue('nonSignedCommands')) && this.getSettingsValue('nonSignedCommands').includes(command.name);
    }

    protected async validateSignature<U>(command: ITransportCommand<U>, signature: ISignature): Promise<void> {
        if (_.isNil(signature)) {
            throw new ExtendedError(`Command "${command.name}" has nil signature`);
        }
        if (_.isNil(signature.nonce)) {
            throw new ExtendedError(`Command "${command.name}" signature has invalid nonce`);
        }
        if (_.isNil(signature.algorithm)) {
            throw new ExtendedError(`Command "${command.name}" signature has invalid algorithm`);
        }
        if (_.isNil(signature.publicKey)) {
            throw new ExtendedError(`Command "${command.name}" signature has invalid publicKey`);
        }

        let manager = _.find(this.getSettingsValue('cryptoManagers'), item => item.algorithm === signature.algorithm);
        if (_.isNil(manager)) {
            throw new ExtendedError(`Command "${command.name}" signature algorithm (${signature.algorithm}) doesn't support`);
        }

        let isVerified = await manager.verify(command, signature);
        if (!isVerified) {
            throw new ExtendedError(`Command "${command.name}" has invalid signature`);
        }
    }

    protected executeCommand<U>(payload: TransportFabricRequestPayload<U>, command: ITransportCommand<U>): void {
        let listener = this.listeners.get(command.name);
        if (_.isNil(listener)) {
            this.complete(command, new ExtendedError(`No listener for "${command.name}" command`));
        } else {
            listener.next(command);
        }
    }

    protected createCommand<U>(stub: ITransportFabricStub, payload: ITransportFabricRequestPayload): ITransportCommand<U> {
        let command = this.getSettingsValue('commandFactory', this.defaultCreateCommandFactory)(payload);
        return new TransportFabricChaincodeCommandWrapper(payload, command, stub);
    }

    protected createStub<U>(stub: ChaincodeStub, payload: TransportFabricRequestPayload<U>, transport: ITransportReceiver): ITransportFabricStub {
        return this.getSettingsValue('stubFactory', this.defaultCreateStubFactory)(stub, payload, transport);
    }

    protected createResponsePayload<U, V = any>(command: ITransportCommand<U>): ITransportFabricResponsePayload<V> {
        return new TransportFabricResponsePayload<U>(command);
    }
}

export interface ITransportFabricChaincodeSettings extends ITransportSettings {
    cryptoManagers?: Array<ITransportCryptoManager>;
    nonSignedCommands?: Array<string>;

    stubFactory?: <U>(stub: ChaincodeStub, payload: TransportFabricRequestPayload<U>, transport: ITransportReceiver) => ITransportFabricStub;
    commandFactory?: <U>(payload: ITransportFabricRequestPayload<U>) => ITransportCommand<U>;
}

interface ITransportFabricRequestStorage<U = any, V = any> extends ITransportRequestStorage {
    payload: TransportFabricRequestPayload<U>;
    handler: PromiseHandler<ITransportFabricResponsePayload<V>, ExtendedError>;
}

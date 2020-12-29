import { ExtendedError } from '@ts-core/common/error';
import { LoadableEvent } from '@ts-core/common/Loadable';
import { ILogger } from '@ts-core/common/logger';
import { ObservableData } from '@ts-core/common/observer';
import { PromiseHandler } from '@ts-core/common/promise';
import { Observable } from 'rxjs';
import { ITransportCommand, ITransportCommandAsync, ITransportEvent, Transport, TransportLogType, TransportTimeoutError } from '@ts-core/common/transport';
import { DateUtil, ObjectUtil, TransformUtil, ValidateUtil } from '@ts-core/common/util';
import { ContractEventListener } from 'fabric-network';
import * as _ from 'lodash';
import { IFabricConnectionSettings, FabricApiClient } from '@hlf-core/api';
import { ITransportSettings } from '@ts-core/common/transport';
import { TransportFabricResponsePayload } from '../TransportFabricResponsePayload';
import { ITransportFabricCommandOptions } from '../ITransportFabricCommandOptions';
import { ITransportFabricRequestOptions } from '../ITransportFabricRequestOptions';
import { TransportFabricCommandOptions } from '../TransportFabricCommandOptions';
import { TRANSPORT_FABRIC_METHOD } from '../constants';
import { TransportFabricRequestPayload } from '../TransportFabricRequestPayload';
import { ITransportFabricConnectionSettings } from './ITransportFabricConnectionSettings';

export class TransportFabricSender extends Transport<ITransportFabricConnectionSettings> {
    // --------------------------------------------------------------------------
    //
    //  Static Methods
    //
    // --------------------------------------------------------------------------

    private static parseEndorsementError<U>(command: ITransportCommand<U>, error: any): ExtendedError {
        if (!_.isEmpty(error.endorsements)) {
            return TransportFabricSender.parseEndorsementError(command, error.endorsements[0]);
        }

        let defaultError = new ExtendedError(`Unable to send "${command.name}" command request: ${error.message}`);
        if (_.isNil(error.message)) {
            return defaultError;
        }
        let message = error.message.replace('transaction returned with failure:', '').trim();
        if (!ObjectUtil.isJSON(message)) {
            return defaultError;
        }
        let response = TransformUtil.toClass(TransportFabricResponsePayload, TransformUtil.toJSON(message));
        let item = ExtendedError.instanceOf(response.response) ? ExtendedError.create(response.response) : defaultError;
        item.stack = null;
        return item;
    }

    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    private contractEvents: Map<string, Promise<ContractEventListener>>;

    private connectionPromise: PromiseHandler<void, ExtendedError>;
    private connectionAttempts: number;

    private _api: FabricApiClient;
    private _isConnected: boolean;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: ILogger, settings: ITransportFabricConnectionSettings, context?: string) {
        super(logger, settings, context);

        this._api = new FabricApiClient(logger, settings);
        this.contractEvents = new Map();
    }

    // --------------------------------------------------------------------------
    //
    //  Public Fabric Methods
    //
    // --------------------------------------------------------------------------

    public async connect(): Promise<void> {
        if (_.isNil(this.settings)) {
            throw new ExtendedError(`Unable to connect: settings is nil`);
        }
        if (!_.isNumber(this.settings.reconnectDelay)) {
            this.settings.reconnectDelay = DateUtil.MILISECONDS_SECOND;
        }
        if (!_.isNumber(this.settings.reconnectMaxAttempts)) {
            this.settings.reconnectMaxAttempts = 0;
        }
        if (!_.isBoolean(this.settings.isExitApplicationOnDisconnect)) {
            this.settings.isExitApplicationOnDisconnect = true;
        }

        if (this.connectionPromise) {
            return this.connectionPromise.promise;
        }

        this.connectionPromise = PromiseHandler.create();
        this.connectionAttempts = 0;
        this.reconnect();

        return this.connectionPromise.promise;
    }

    public disconnect(error?: ExtendedError): void {
        if (this.connectionPromise) {
            this.connectionPromise.reject(error);
            this.connectionPromise = null;
        }

        this.api.disconnect();
        this._isConnected = false;

        for (let item of this.contractEvents.values()) {
            item.then(item => item.unregister());
        }
        this.contractEvents.clear();

        if (!_.isNil(error)) {
            this.error(error);
        }

        if (this.settings.isExitApplicationOnDisconnect) {
            this.log(`Exit application: disconnected`);
            process.exit(0);
        }
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public send<U>(command: ITransportCommand<U>, options?: ITransportFabricCommandOptions): void {
        this.requestSend(command, this.getCommandOptions(command, options), false);
    }

    public async sendListen<U, V>(command: ITransportCommandAsync<U, V>, options?: ITransportFabricCommandOptions): Promise<V> {
        if (this.promises.has(command.id)) {
            return this.promises.get(command.id).handler.promise;
        }

        options = this.getCommandOptions(command, options);

        let handler = PromiseHandler.create<V, ExtendedError>();
        this.promises.set(command.id, { command, handler, options });
        this.requestSend(command, options, true);
        this.commandTimeout(command, options);
        return handler.promise;
    }

    public getDispatcher<T>(name: string): Observable<T> {
        if (!this.contractEvents.has(name)) {
            this.contractEvents.set(name, this.api.contract.addContractListener(name, name, this.contractEventCallback));
        }
        return super.getDispatcher(name);
    }

    public complete<U, V>(command: ITransportCommand<U>, result?: V | Error): void {
        throw new ExtendedError(`Method is not supported, implemented only in chaincode`);
    }

    public wait<U>(command: ITransportCommand<U>): void {
        throw new ExtendedError(`Method is not supported, implemented only in chaincode`);
    }

    public dispatch<T>(event: ITransportEvent<T>): void {
        throw new ExtendedError(`Method is not supported, implemented only in chaincode`);
    }

    public listen<U>(name: string): Observable<U> {
        throw new ExtendedError(`Method is not supported, implemented only in chaincode`);
    }

    public destroy(): void {
        super.destroy();
        if (this.isDestroyed) {
            return;
        }

        this.disconnect();
        this.requests = null;
        this.contractEvents = null;
    }

    // --------------------------------------------------------------------------
    //
    //  Send Methods
    //
    // --------------------------------------------------------------------------

    protected async requestSend<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions, isNeedReply: boolean): Promise<void> {
        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send "${command.name}" command request: transport is not connected`);
        }

        try {
            let request = this.createRequestOptions(command, options, isNeedReply);
            let method = this.isCommandQuery(command) ? this.api.contract.evaluateTransaction : this.api.contract.submitTransaction;

            this.logCommand(command, isNeedReply ? TransportLogType.REQUEST_SENDED : TransportLogType.REQUEST_NO_REPLY);
            this.observer.next(new ObservableData(LoadableEvent.STARTED, command));

            let response = await method.call(this.api.contract, request.method, TransformUtil.fromJSON(TransformUtil.fromClass(request.payload)));
            if (this.isCommandAsync(command) && isNeedReply) {
                this.responseMessageReceived(command.id, response);
            }
        } catch (error) {
            error = ExtendedError.instanceOf(error) ? error : TransportFabricSender.parseEndorsementError(command, error);

            this.error(error);
            if (!this.isCommandAsync(command)) {
                return;
            }
            command.response(error);
            this.logCommand(command, TransportLogType.RESPONSE_RECEIVED);
            this.commandProcessed(command);
        }
    }

    protected async eventSend<U>(event: ITransportEvent<U>): Promise<void> {
        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send "${event.name}" event: transport is not connected`);
        }
        this.logEvent(event, TransportLogType.EVENT_SENDED);
    }

    protected async waitSend<U>(command: ITransportCommand<U>): Promise<void> {
        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send wait "${command.name}" command: transport is not connected`);
        }
        this.logCommand(command, TransportLogType.RESPONSE_WAIT);
    }

    // --------------------------------------------------------------------------
    //
    //  Recevie Message Methods
    //
    // --------------------------------------------------------------------------

    protected responseMessageReceived(id: string, data: Buffer): void {
        let promise = this.promises.get(id);
        if (_.isNil(promise)) {
            this.error(`Invalid response: unable to find command "${id}" (probably timeout already expired)`);
            return;
        }

        let payload: TransportFabricResponsePayload = null;

        try {
            payload = TransportFabricResponsePayload.parse(data);
        } catch (error) {
            payload = new TransportFabricResponsePayload();
            payload.id = id;
            payload.response = ExtendedError.create(error);
        }

        let command = promise.command;
        command.response(payload.response);

        // Remove stack from error because it's useless
        if (this.isCommandHasError(command)) {
            command.error.stack = null;
        }

        this.logCommand(command, TransportLogType.RESPONSE_RECEIVED);
        this.commandProcessed(command);
    }

    // --------------------------------------------------------------------------
    //
    //  Queue Methods
    //
    // --------------------------------------------------------------------------

    protected createRequestOptions<U>(
        command: ITransportCommand<U>,
        options: ITransportFabricCommandOptions,
        isNeedReply: boolean
    ): ITransportFabricRequestOptions<U> {
        let item = new TransportFabricRequestPayload<U>();
        item.options = TransformUtil.toClass(TransportFabricCommandOptions, options);
        item.isNeedReply = isNeedReply;
        ObjectUtil.copyProperties(command, item, ['id', 'name', 'request']);

        ValidateUtil.validate(item);

        let request: ITransportFabricRequestOptions = { method: TRANSPORT_FABRIC_METHOD, payload: item };
        return request;
    }

    protected getCommandOptions<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions): ITransportFabricCommandOptions {
        return super.getCommandOptions(command, options) as ITransportFabricCommandOptions;
    }

    protected isCommandQuery<U>(command: ITransportCommand<U>): boolean {
        if (ObjectUtil.hasOwnProperty(command, 'isQuery')) {
            return command['isQuery'] === true;
        }
        if (ObjectUtil.hasOwnProperty(command, 'isReadonly')) {
            return command['isReadonly'] === true;
        }
        return false;
    }

    // --------------------------------------------------------------------------
    //
    //  Event Handlers
    //
    // --------------------------------------------------------------------------

    protected connectionConnectCompleteHandler = (): void => {
        this._isConnected = true;
        if (this.connectionPromise) {
            this.connectionPromise.resolve();
        }
    };

    protected connectionConnectErrorHandler = (error: ExtendedError): void => {
        this.disconnect(error);
    };

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected async reconnect(): Promise<void> {
        this.debug(`Connecting to Fabric "${this.settings.fabricIdentity}:${this.settings.fabricNetworkName}:${this.settings.fabricChaincodeName}"`);

        this.connectionAttempts++;
        try {
            await this.api.connect();
            this.connectionConnectCompleteHandler();
        } catch (error) {
            error = ExtendedError.create(error, TransportTimeoutError.ERROR_CODE);
            if (this.connectionAttempts > this.settings.reconnectMaxAttempts) {
                this.connectionConnectErrorHandler(error);
                return;
            }
            await PromiseHandler.delay(this.settings.reconnectDelay);
            this.debug(`Trying to reconnect (attempt ${this.connectionAttempts}): ${error.message}`);
            this.reconnect();
        }
    }

    protected contractEventCallback = <T>(error: Error, event: any): void => {
        if (!_.isNil(error)) {
            this.error(error);
            return;
        }
        if (_.isNil(event)) {
            this.warn(`Received nil event`);
            return;
        }
        if (!this.dispatchers.has(event.event_name)) {
            return;
        }
        this.dispatchers.get(event.event_name).next(TransformUtil.toJSON(event.payload.toString()));
    };

    // --------------------------------------------------------------------------
    //
    //  Public Properties
    //
    // --------------------------------------------------------------------------

    public get isConnected(): boolean {
        return this._isConnected;
    }

    public get api(): FabricApiClient {
        return this._api;
    }
}

import {
    ITransportCommand,
    ITransportCommandAsync,
    ITransportEvent,
    ILogger,
    PromiseHandler,
    ExtendedError,
    TransportTimeoutError,
    ITransportCommandRequest
} from '@ts-core/common';
import { DateUtil, ObjectUtil, TransformUtil, TransportImpl, ValidateUtil } from '@ts-core/common';
import { ContractListener, BlockListener, Transaction, BlockEvent, ContractEvent } from 'fabric-network';
import { Block, FabricApiClient, IFabricBlock } from '@hlf-core/api';
import { ITransportFabricConnectionSettings } from './ITransportFabricConnectionSettings';
import { ITransportFabricCommandOptions, TransportFabricCommandOptions, TransportFabricRequestPayload, TransportFabricResponsePayload, TRANSPORT_FABRIC_METHOD, ITransportFabricRequestPayload } from '@hlf-core/transport-common';
import * as _ from 'lodash';

export class TransportFabric<T extends ITransportFabricConnectionSettings = ITransportFabricConnectionSettings> extends TransportImpl<T, ITransportFabricCommandOptions> {

    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected blockEvent: BlockListener;
    protected contractEvent: ContractListener;

    protected connectionPromise: PromiseHandler<void, ExtendedError>;
    protected connectionAttempts: number;

    protected _api: FabricApiClient;
    protected _isConnected: boolean;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(logger: ILogger, settings: T, context?: string) {
        super(logger, settings, context);
        this._api = new FabricApiClient(logger, settings);
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
        if (!_.isNil(this.connectionPromise)) {
            this.connectionPromise.reject(error);
            this.connectionPromise = null;
        }

        if (!_.isNil(this.contractEvent)) {
            this.api.contract.removeContractListener(this.contractEvent);
            this.contractEvent = null;
        }

        if (!_.isNil(this.blockEvent)) {
            this.api.network.removeBlockListener(this.blockEvent);
            this.blockEvent = null;
        }

        this.api.disconnect();
        this._isConnected = false;

        if (!_.isNil(error)) {
            this.error(error)
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

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }
        this.disconnect();
        super.destroy();
    }

    // --------------------------------------------------------------------------
    //
    //  Send Methods
    //
    // --------------------------------------------------------------------------

    protected async commandRequestExecute<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions, isNeedReply: boolean): Promise<void> {
        if (!this.isConnected) {
            throw new ExtendedError(`Unable to send "${command.name}" command request: transport is not connected`);
        }

        let payload = this.createRequestPayload(command, options, isNeedReply);
        TransportFabricRequestPayload.clear(payload);

        let response = await this.transactionSend(this.api.contract.createTransaction(TRANSPORT_FABRIC_METHOD), command, payload);
        if (isNeedReply && this.isCommandAsync(command)) {
            this.responseMessageReceived(command.id, response);
        }
    }

    protected async transactionSend<U>(transaction: Transaction, command: ITransportCommand<U>, payload: ITransportFabricRequestPayload<U>): Promise<any> {
        let method = payload.isReadonly ? transaction.evaluate : transaction.submit;
        return method.call(transaction, TransformUtil.fromJSON(TransformUtil.fromClass(payload)));
    }

    // --------------------------------------------------------------------------
    //
    //  Receive Message Methods
    //
    // --------------------------------------------------------------------------

    protected responseMessageReceived(id: string, item: Buffer): void {
        let promise = this.promises.get(id);
        if (_.isNil(promise)) {
            this.warn(`Unable to find command promise: probably command was already completed`);
            return;
        }

        let payload: TransportFabricResponsePayload = null;
        try {
            payload = TransportFabricResponsePayload.parse(item);
        } catch (error) {
            payload = TransportFabricResponsePayload.fromError(id, ExtendedError.create(error));
        }
        finally {
            this.commandRequestResponseReceived(promise, payload.response);
        }
    }

    // --------------------------------------------------------------------------
    //
    //  Queue Methods
    //
    // --------------------------------------------------------------------------

    protected createRequestPayload<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions, isNeedReply: boolean): ITransportFabricRequestPayload<U> {
        let item = new TransportFabricRequestPayload<U>();
        item.id = command.id;
        item.name = command.name;
        item.options = TransformUtil.toClass(TransportFabricCommandOptions, options);
        if (!_.isNil(command.request)) {
            item.request = command.request;
        }
        if (this.isCommandReadonly(command)) {
            item.isReadonly = true;
        }
        if (isNeedReply) {
            item.isNeedReply = isNeedReply;
        }
        ValidateUtil.validate(item);
        return item;
    }

    protected getCommandOptions<U>(command: ITransportCommand<U>, options: ITransportFabricCommandOptions): ITransportFabricCommandOptions {
        let item = super.getCommandOptions(command, options);
        TransportFabricRequestPayload.clearDefaultOptions(options);
        return item;
    }

    protected isCommandReadonly<U>(command: ITransportCommand<U>): boolean {
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
    //  Connection Methods
    //
    // --------------------------------------------------------------------------

    private blockEventCallbackProxy = async (event: BlockEvent): Promise<void> => this.blockEventCallback(FabricApiClient.parseBlock(event.blockData as Block));

    private contractEventCallbackProxy = async (event: ContractEvent): Promise<void> => this.contractEventCallback(event);

    protected async connectionCompleteHandler(): Promise<void> {
        this._isConnected = true;
        this.blockEvent = await this.api.network.addBlockListener(this.blockEventCallbackProxy);
        this.contractEvent = await this.api.contract.addContractListener(this.contractEventCallbackProxy);
        if (!_.isNil(this.connectionPromise)) {
            this.connectionPromise.resolve();
        }
    }

    protected async connectionErrorHandler(error: ExtendedError): Promise<void> {
        this.disconnect(error);
    }

    protected async blockEventCallback(event: IFabricBlock): Promise<void> { }

    protected async contractEventCallback(event: ContractEvent): Promise<void> { }

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
            await this.connectionCompleteHandler();
        } catch (error) {
            error = ExtendedError.create(error, TransportTimeoutError.ERROR_CODE);
            if (this.connectionAttempts > this.settings.reconnectMaxAttempts) {
                await this.connectionErrorHandler(error);
                return;
            }
            await PromiseHandler.delay(this.settings.reconnectDelay);
            this.debug(`Trying to reconnect (attempt ${this.connectionAttempts}): ${error.message}`);
            this.reconnect();
        }
    }

    protected parseError(error: any): ExtendedError {
        if (ExtendedError.instanceOf(error)) {
            return super.parseError(error);
        }

        let item = null;
        if (!_.isNil(error.response)) {
            item = error.response;
        } else if (!_.isEmpty(error.responses)) {
            item = error.responses[0].response;
        } else if (!_.isEmpty(error.endorsements)) {
            item = error.endorsements[0];
        }
        else if (error.status === 500) {
            item = error;
        }

        let { message } = error;
        if (!_.isNil(item)) {
            error = this.parseChaincodeError(item);
        }
        return !_.isNil(error) ? error : new ExtendedError(`Unable to send command request: ${message}`);
    }

    protected parseChaincodeError(error: any): ExtendedError {
        let message = error.message.replace('error in simulation: transaction returned with failure:', '').trim();
        if (!ObjectUtil.isJSON(message)) {
            return null;
        }
        let response = TransformUtil.toClass(TransportFabricResponsePayload, TransformUtil.toJSON(message));
        if (!ExtendedError.instanceOf(response.response)) {
            return null;
        }
        let item = ExtendedError.create(response.response);
        item.stack = null;
        return item;
    }

    protected eventRequestExecute<U>(event: ITransportEvent<U>, options?: void): Promise<void> {
        throw new ExtendedError(`Method doesn't supported`);
    }

    protected commandResponseExecute<U, V>(command: ITransportCommandAsync<U, V>, request: ITransportCommandRequest): Promise<void> {
        throw new ExtendedError(`Method doesn't supported`);
    }

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

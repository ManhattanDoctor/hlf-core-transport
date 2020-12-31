import { ExtendedError } from '@ts-core/common/error';
import { ITransportEvent } from '@ts-core/common/transport';
import { ArrayUtil } from '@ts-core/common/util';
import { ChaincodeStub } from 'fabric-shim';
import * as _ from 'lodash';
import { TransportFabricStub } from '../stub';

export class TransportFabricStubWrapper extends TransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected state: Map<string, string>;
    protected keysToRemove: Array<string>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(stub: ChaincodeStub) {
        super(stub, null, null, null);

        this.state = new Map();
        this.keysToRemove = new Array();
    }

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected isKeyRemoved(key: string): boolean {
        return this.keysToRemove.includes(key);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public async commitToState(): Promise<void> {
        for (let key of this.keysToRemove) {
            await super.removeState(key);
        }
        for (let key of this.state.keys()) {
            await super.putStateRaw(key, this.state.get(key));
        }
        this.state.clear();
        this.keysToRemove = [];
    }

    public async getStateRaw(key: string): Promise<string> {
        if (this.isKeyRemoved(key)) {
            return null;
        }
        if (this.state.has(key)) {
            return this.state.get(key);
        }
        let item = await super.getStateRaw(key);
        this.state.set(key, item);
        return item;
    }

    public async putStateRaw(key: string, item: string): Promise<void> {
        if (this.isKeyRemoved(key)) {
            ArrayUtil.remove(this.keysToRemove, key);
        }
        this.state.set(key, item);
    }

    public async removeState(key: string): Promise<void> {
        if (!this.isKeyRemoved(key)) {
            this.keysToRemove.push(key);
        }
        this.state.delete(key);
    }

    public dispatch<T>(event: ITransportEvent<T>): Promise<void> {
        throw new ExtendedError('Method is not supported');
    }

    public destroy(): void {
        super.destroy();

        this.state.clear();
        this.state = null;

        this.keysToRemove = null;
    }
}

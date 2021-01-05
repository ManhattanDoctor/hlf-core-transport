import { ArrayUtil } from '@ts-core/common/util';
import { ChaincodeStub, Iterators } from 'fabric-shim';
import * as _ from 'lodash';
import { IKeyValue, TransportFabricStub } from '../stub';

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

    // --------------------------------------------------------------------------
    //
    //  Public Override Methods
    //
    // --------------------------------------------------------------------------

    public async loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<IKeyValue>> {
        let items = await super.loadKV(iterator);
        items = items.filter(item => !this.isKeyRemoved(item.key));
        return items;
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

    public destroy(): void {
        super.destroy();
        if (this.isDestroyed) {
            return;
        }

        this.state.clear();
        this.state = null;
        this.keysToRemove = null;
    }
}

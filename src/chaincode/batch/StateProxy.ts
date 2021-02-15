import { Destroyable } from '@ts-core/common';
import { ITransportEvent } from '@ts-core/common/transport';
import { ArrayUtil, ValidateUtil } from '@ts-core/common/util';
import * as _ from 'lodash';
import { IKeyValue } from '../stub';

export class StateProxy extends Destroyable {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected state: Map<string, string>;
    protected _events: Array<ITransportEvent<any>>;

    protected _toPut: Map<string, string>;
    protected _toRemove: Array<string>;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(protected getStateRaw: (key: string) => Promise<string>) {
        super();

        this.state = new Map();
        this._events = new Array();

        this._toPut = new Map();
        this._toRemove = new Array();
    }

    // --------------------------------------------------------------------------
    //
    //  Protected Methods
    //
    // --------------------------------------------------------------------------

    protected isRemoved(key: string): boolean {
        return this.toRemove.includes(key);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public checkKV(items: Array<IKeyValue>): void {
        for (let i = items.length - 1; i > -1; i--) {
            let item = items[i];
            if (this.isRemoved(item.key)) {
                items.splice(i, 1);
            } else if (this.state.has(item.key)) {
                items.splice(i, 1, item);
            }
        }
    }

    public dispatch<T>(value: ITransportEvent<T>, isNeedValidate: boolean = true): void {
        if (isNeedValidate) {
            ValidateUtil.validate(value);
        }
        this._events.push(value);
    }

    public async getState(key: string): Promise<string> {
        if (this.isRemoved(key)) {
            return null;
        }
        if (this.state.has(key)) {
            return this.state.get(key);
        }
        let item = await this.getStateRaw(key);
        this.state.set(key, item);
        return item;
    }

    public putState(key: string, item: string): void {
        if (this.isRemoved(key)) {
            ArrayUtil.remove(this.toRemove, key);
        }
        this.state.set(key, item);
        this.toPut.set(key, item);
    }

    public removeState(key: string): void {
        if (!this.isRemoved(key)) {
            this.toRemove.push(key);
        }
        this.state.delete(key);
        this.toPut.delete(key);
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }
        super.destroy();

        this.getStateRaw = null;

        this.state.clear();
        this.state = null;

        this.toPut.clear();
        this._toPut = null;

        this._toRemove = null;
        console.log('destroy');
    }

    // --------------------------------------------------------------------------
    //
    //  Public Properties
    //
    // --------------------------------------------------------------------------

    public get events(): Array<ITransportEvent<any>> {
        return this._events;
    }

    public get toRemove(): Array<string> {
        return this._toRemove;
    }

    public get toPut(): Map<string, string> {
        return this._toPut;
    }
}

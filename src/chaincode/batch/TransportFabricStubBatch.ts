import * as _ from 'lodash';
import { ITransportReceiver } from '@ts-core/common/transport';
import { TransportFabricStubWrapper } from './TransportFabricStubWrapper';
import { TransportFabricStub } from '../stub';
import { ITransportFabricCommandOptions } from '../../ITransportFabricCommandOptions';

export class TransportFabricStubBatch extends TransportFabricStub {
    // --------------------------------------------------------------------------
    //
    //  Properties
    //
    // --------------------------------------------------------------------------

    protected wrapper: TransportFabricStubWrapper;

    // --------------------------------------------------------------------------
    //
    //  Constructor
    //
    // --------------------------------------------------------------------------

    constructor(wrapper: TransportFabricStubWrapper, requestId: string, options: ITransportFabricCommandOptions, transport: ITransportReceiver) {
        super(wrapper.stub, requestId, options, transport);
        this.wrapper = wrapper;
    }

    // --------------------------------------------------------------------------
    //
    //  Public State Methods
    //
    // --------------------------------------------------------------------------

    public async getStateRaw(key: string): Promise<string> {
        return this.wrapper.getStateRaw(key);
    }

    public async putStateRaw(key: string, item: string): Promise<void> {
        return this.wrapper.putStateRaw(key, item);
    }

    public async removeState(key: string): Promise<void> {
        return this.wrapper.removeState(key);
    }

    // --------------------------------------------------------------------------
    //
    //  Public Methods
    //
    // --------------------------------------------------------------------------

    public destroy(): void {
        super.destroy();
    }
}

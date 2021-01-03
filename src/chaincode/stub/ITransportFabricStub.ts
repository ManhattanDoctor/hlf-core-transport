import { ClassType } from 'class-transformer/ClassTransformer';
import { ChaincodeStub, Iterators } from 'fabric-shim';
import { IDestroyable } from '@ts-core/common';
import { ITransportEvent } from '@ts-core/common/transport';
import { IPageBookmark, IPaginationBookmark } from '@ts-core/common/dto';

export interface ITransportFabricStub extends IDestroyable {
    readonly stub: ChaincodeStub;

    readonly userId: string;
    readonly userPublicKey: string;

    readonly requestId: string;
    readonly transactionHash: string;
    readonly transactionDate: Date;

    loadKV(iterator: Iterators.StateQueryIterator): Promise<Array<IKeyValue>>;
    getPaginatedKV(request: IPageBookmark, start: string, finish: string): Promise<IPaginationBookmark<IKeyValue>>;

    getState<U>(key: string, type?: ClassType<U>, isNeedValidate?: boolean): Promise<U>;
    getStateRaw(key: string): Promise<string>;

    putState<U>(key: string, value: U, isNeedValidate?: boolean, isNeedTransform?: boolean): Promise<U>;
    putStateRaw(key: string, value: string): Promise<void>;

    hasState(key: string): Promise<boolean>;
    removeState(key: string): Promise<void>;

    dispatch<T>(event: ITransportEvent<T>): Promise<void>;
}

export interface IKeyValue {
    key: string;
    value?: string;
}

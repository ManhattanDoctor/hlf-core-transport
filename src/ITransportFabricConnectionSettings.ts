import { ITransportSettings } from '@ts-core/common';
import { IFabricConnectionSettings } from '@hlf-core/api';

export interface ITransportFabricConnectionSettings extends IFabricConnectionSettings, ITransportSettings {
    reconnectDelay?: number;
    reconnectMaxAttempts?: number;
    isExitApplicationOnDisconnect?: boolean;
}

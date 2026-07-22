# @hlf-core/transport

> TypeScript библиотека клиентского транспорта Hyperledger Fabric: отправка команд, разбор блоков и получение событий

[![npm version](https://img.shields.io/npm/v/@hlf-core/transport.svg)](https://www.npmjs.com/package/@hlf-core/transport)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Клиентская сторона транспорта: подключение к сети, отправка команд в chaincode, получение ответов, разбор блоков и событий. Реализует модель команд `@ts-core/common` поверх `fabric-network`, поэтому прикладной код работает с транспортом одинаково, независимо от того, ходит он в блокчейн или в обычный сервис.

Парный пакет на стороне chaincode — [@hlf-core/transport-chaincode](https://www.npmjs.com/package/@hlf-core/transport-chaincode), общий протокол — [@hlf-core/transport-common](https://www.npmjs.com/package/@hlf-core/transport-common).

## Содержание

- [Описание](#описание)
  - [Основные возможности](#основные-возможности)
- [Установка](#установка)
  - [Зависимости](#зависимости)
- [Быстрый старт](#быстрый-старт)
- [Как это работает](#как-это-работает)
  - [Подключение и переподключение](#подключение-и-переподключение)
  - [Отправка команды](#отправка-команды)
  - [Ошибки chaincode](#ошибки-chaincode)
  - [Блоки и события](#блоки-и-события)
  - [Пакетный режим](#пакетный-режим)
- [API документация](#api-документация)
  - [TransportFabric](#transportfabric)
  - [ITransportFabricConnectionSettings](#itransportfabricconnectionsettings)
  - [TransportFabricBlockParser](#transportfabricblockparser)
  - [TransportFabricBatch](#transportfabricbatch)
  - [TransportFabricBlockParserBatch](#transportfabricblockparserbatch)
  - [Фабрики](#фабрики)
- [Примеры использования](#примеры-использования)
- [Важные особенности](#важные-особенности)
- [Структура проекта](#структура-проекта)
- [Связанные пакеты](#связанные-пакеты)

## Описание

Транспорт наследует `TransportImpl` из `@ts-core/common`, то есть предоставляет привычные `send` и `sendListen` для команд. Разница с обычным транспортом в том, что доставка идёт через Hyperledger Fabric: команда упаковывается в конверт, отправляется единственным методом контракта и, в зависимости от признака `isReadonly`, выполняется как запрос без записи либо как транзакция с подтверждением.

Обратное направление устроено иначе. Chaincode не может «ответить» вне транзакции, поэтому события приходят не через транспорт, а из блоков: транспорт подписывается на блоки сети и разбирает их содержимое.

### Основные возможности

- **Отправка команд** — с автоматическим выбором между запросом и транзакцией по признаку `isReadonly`
- **Подключение с переподключением** — настраиваемые задержка и число попыток
- **Разбор ошибок chaincode** — доменная ошибка извлекается из ответа Fabric и восстанавливается как `ExtendedError` с кодом и деталями
- **Разбор блоков** — транзакции, события, коды валидации, связь событий с породившими их транзакциями
- **Пакетный режим** — команды накапливаются chaincode и исполняются одной транзакцией, ответы разбираются из блока
- **Фабрика транспортов** — переиспользование подключений по идентификатору

## Установка

```bash
npm install @hlf-core/transport
```

### Зависимости

```json
{
    "@hlf-core/api": "~3.1.4",
    "@hlf-core/transport-common": "~3.0.15"
}
```

Транзитивно подтягиваются `@ts-core/common`, `fabric-network` и `fabric-common` (через `@hlf-core/api`).

## Быстрый старт

```ts
import { TransportFabric } from '@hlf-core/transport';

let transport = new TransportFabric(logger, {
    fabricIdentity: 'user',
    fabricNetworkName: 'mychannel',
    fabricChaincodeName: 'mychaincode',
    fabricConnectionSettingsPath: './connection.json',
    fabricIdentityPrivateKey: privateKey,
    fabricIdentityCertificate: certificate,

    reconnectDelay: 1000,
    reconnectMaxAttempts: 5,
    isExitApplicationOnDisconnect: false
});

await transport.connect();

// команда с ответом
let user = await transport.sendListen(new UserGetCommand(uid));

// команда без ожидания ответа
transport.send(new UserAddCommand({ name: 'Ivan', publicKey }));
```

## Как это работает

### Подключение и переподключение

`connect()` проставляет значения по умолчанию и запускает цикл подключения:

```ts
if (!_.isNumber(this.settings.reconnectDelay)) { this.settings.reconnectDelay = DateUtil.MILISECONDS_SECOND; }
if (!_.isNumber(this.settings.reconnectMaxAttempts)) { this.settings.reconnectMaxAttempts = 0; }
if (!_.isBoolean(this.settings.isExitApplicationOnDisconnect)) { this.settings.isExitApplicationOnDisconnect = true; }
```

Попытки повторяются с задержкой `reconnectDelay`, пока их число не превысит `reconnectMaxAttempts`. По умолчанию повторов нет: `reconnectMaxAttempts` равен нулю, поэтому первая же неудача приводит к разрыву.

При успешном подключении транспорт подписывается на блоки сети и события контракта, после чего разрешается промис `connect()`.

> **Важно:** `isExitApplicationOnDisconnect` по умолчанию включён, и при разрыве транспорт завершает процесс через `process.exit(1)`. Это удобно для сервисов под управлением оркестратора, который перезапустит контейнер, но неожиданно в других сценариях. Подробнее — в разделе [Важные особенности](#важные-особенности).

### Отправка команды

```ts
protected async commandRequestExecute(command, options, isNeedReply) {
    let payload = this.createRequestPayload(command, options, isNeedReply);
    TransportFabricRequestPayload.clear(payload);

    let response = await this.transactionSend(this.api.contract.createTransaction(TRANSPORT_FABRIC_METHOD), command, payload);
    if (isNeedReply && this.isCommandAsync(command)) {
        this.responseMessageReceived(command.id, response);
    }
}
```

Шаги: собрать конверт, вычистить из него значения по умолчанию, отправить через единственный метод контракта, разобрать ответ.

Способ отправки выбирается по признаку команды:

```ts
let method = payload.isReadonly ? transaction.evaluate : transaction.submit;
```

`evaluate` выполняет команду на peer без создания транзакции — ничего не попадает в леджер. `submit` проходит полный цикл подтверждения и записи.

Признак берётся из самой команды, причём поддерживаются оба имени — историческое `isQuery` и текущее `isReadonly`:

```ts
protected isCommandReadonly<U>(command: ITransportCommand<U>): boolean {
    if (ObjectUtil.hasOwnProperty(command, 'isQuery')) { return command['isQuery'] === true; }
    if (ObjectUtil.hasOwnProperty(command, 'isReadonly')) { return command['isReadonly'] === true; }
    return false;
}
```

### Ошибки chaincode

Fabric возвращает ошибку chaincode обёрнутой в собственную структуру и с текстовым префиксом. Транспорт разбирает её и восстанавливает исходную доменную ошибку:

```ts
protected parseChaincodeError(error: any): ExtendedError {
    let message = error.message.replace('error in simulation: transaction returned with failure:', '').trim();
    if (!ObjectUtil.isJSON(message)) { return null; }

    let response = TransformUtil.toClass(TransportFabricResponsePayload, TransformUtil.toJSON(message));
    if (!ExtendedError.instanceOf(response.response)) { return null; }

    let item = ExtendedError.create(response.response);
    item.stack = null;
    return item;
}
```

Благодаря этому прикладной код ловит ту же ошибку с тем же кодом, что была брошена внутри chaincode, а не строку с текстом транзакции. Стек обнуляется — он относился бы к клиенту и вводил в заблуждение.

Источник ошибки ищется последовательно в `response`, `responses[0].response`, `endorsements[0]` и в самой ошибке при статусе 500 — форма ответа зависит от того, на каком этапе Fabric прервал выполнение.

### Блоки и события

Транспорт односторонний: команды идут только от клиента к chaincode. Попытка отправить событие или ответ в обратную сторону явно запрещена:

```ts
protected eventRequestExecute<U>(event: ITransportEvent<U>, options?: void): Promise<void> {
    throw new ExtendedError(`Method doesn't supported`);
}
```

События приходят из блоков. `TransportFabricBlockParser` разбирает блок в структуру с транзакциями и событиями, попутно проставляя коды валидации из метаданных блока и связывая события с транзакциями по хэшу:

```ts
public static checkEventsTransaction(events, transactions): void {
    let map = new Map();
    transactions.forEach(item => map.set(item.hash, item));

    for (let event of events) {
        let item = map.get(event.transactionHash);
        event.requestId = item.requestId;
        event.transactionValidationCode = item.validationCode;
    }
}
```

Так по событию можно узнать, какая команда его породила (`requestId`) и была ли транзакция принята сетью (`transactionValidationCode`) — событие в блоке присутствует даже у отклонённой транзакции.

События транспорта отличаются от прочих по имени: всё, что опубликовано под `transportFabricEvent`, разбирается как карта «хэш транзакции → список событий», остальное — как одиночное событие chaincode.

Для наследников предусмотрены пустые хуки:

```ts
protected async blockEventCallback(event: IFabricBlock): Promise<void> { }
protected async contractEventCallback(event: ContractEvent): Promise<void> { }
```

### Пакетный режим

`TransportFabricBatch` меняет схему доставки для команд, изменяющих состояние. Команда отправляется, но ответ не ожидается сразу: chaincode накапливает такие команды и исполняет их одной транзакцией. Ответы возвращаются позже — из блока.

```ts
protected async commandRequestExecute(command, options, isNeedReply) {
    if (this.isCommandReadonly(command)) {
        return super.commandRequestExecute(command, options, isNeedReply);   // readonly — как обычно
    }
    let payload = this.createRequestPayload(command, options, isNeedReply);
    TransportFabricRequestPayload.clear(payload);
    return this.transactionSend(...);   // ответ придёт из блока
}
```

Когда приходит блок, транспорт ищет в нём успешную пакетную транзакцию и разбирает её ответ как карту «хэш → ответ», после чего разрешает промисы ожидающих команд:

```ts
let payload = TransformUtil.toClass(TransportFabricResponsePayload, batch.response);
for (let hash in payload.response) {
    let item = TransformUtil.toClass(TransportFabricResponsePayload, payload.response[hash]);
    this.responseMessageReceived(item.id, TransformUtil.fromClassBuffer(item));
}
```

Команды на чтение в пакет не попадают — они по-прежнему выполняются немедленно через `evaluate`.

## API документация

### TransportFabric

```ts
class TransportFabric<T extends ITransportFabricConnectionSettings> extends TransportImpl<T, ITransportFabricCommandOptions>
```

| Метод | Назначение |
|---|---|
| `connect(): Promise<void>` | подключение к сети с переподключением; повторный вызов возвращает тот же промис |
| `disconnect(error?): void` | отписка от блоков и событий, разрыв подключения |
| `destroy(): void` | уничтожение транспорта; внутри вызывает `disconnect()` |
| `isConnected: boolean` | состояние подключения |
| `api: FabricApiClient` | доступ к клиенту Fabric для прямых операций |

Команды отправляются унаследованными `send` и `sendListen` из `TransportImpl`.

Методы для переопределения в наследниках:

| Метод | Назначение |
|---|---|
| `blockEventCallback(block)` | вызывается на каждый блок сети |
| `contractEventCallback(event)` | вызывается на каждое событие контракта |
| `isCommandReadonly(command)` | определение способа отправки |
| `parseError(error)` / `parseChaincodeError(error)` | разбор ошибок Fabric |

### ITransportFabricConnectionSettings

```ts
export interface ITransportFabricConnectionSettings extends IFabricConnectionSettings, ITransportSettings {
    reconnectDelay?: number;
    reconnectMaxAttempts?: number;
    isExitApplicationOnDisconnect?: boolean;
}
```

| Параметр | По умолчанию | Назначение |
|---|---|---|
| `reconnectDelay` | 1000 мс | задержка между попытками подключения |
| `reconnectMaxAttempts` | `0` | максимум повторов; ноль означает отсутствие повторов |
| `isExitApplicationOnDisconnect` | `true` | завершать процесс при разрыве |

Остальные параметры подключения (идентичность, канал, имя chaincode, сертификаты) наследуются из `IFabricConnectionSettings` пакета `@hlf-core/api`.

### TransportFabricBlockParser

```ts
class TransportFabricBlockParser<U extends ITransportFabricTransaction, V extends ITransportFabricEvent, T extends ITransportFabricBlock<U, V>>
```

| Метод | Назначение |
|---|---|
| `parse(block): Promise<T>` | разбор блока в транзакции и события |
| `parseTransaction(data): U` | разбор одной транзакции с кодом валидации |
| `checkEventsTransaction(events, transactions)` | связывание событий с транзакциями по хэшу |
| `isTransactionValid(item)` | код валидации равен `VALID` |
| `isTransactionError(item)` | ответ транзакции является ошибкой |
| `isTransactionSucceed(item)` | транзакция валидна и не содержит ошибки |

Разбирается только то, что относится к транспорту: транзакция учитывается, если вызван метод `transportFabricExecute` ровно с двумя аргументами.

Структура разобранного блока:

```ts
export interface ITransportFabricBlock<U, V> {
    hash: string;
    date: Date;
    number: number;
    events: Array<V>;
    transactions: Array<U>;
}

export interface ITransportFabricTransaction<U = any, V = any> {
    hash: string;
    date: Date;
    channel: string;
    requestId: string;
    chaincode: ITransportFabricTransactionChaincode;
    validationCode: FabricTransactionValidationCode;

    request: ITransportFabricRequestPayload<U>;
    response: ITransportFabricResponsePayload<V>;
}
```

Событие несёт ссылку на породившую его транзакцию:

```ts
export interface ITransportFabricEvent<T = any> extends ITransportEvent<T> {
    date: Date;
    channel: string;
    requestId: string;
    chaincode: string;
    transactionHash: string;
    transactionValidationCode: FabricTransactionValidationCode;
}
```

### TransportFabricBatch

```ts
class TransportFabricBatch<T extends ITransportFabricConnectionSettings> extends TransportFabric<T>
```

Наследник, доставляющий изменяющие команды пакетами. Интерфейс отправки не меняется — прикладной код по-прежнему использует `send` и `sendListen`, но ответ на изменяющую команду приходит после того, как chaincode исполнит пакет и он попадёт в блок.

### TransportFabricBlockParserBatch

```ts
class TransportFabricBlockParserBatch extends TransportFabricBlockParser<ITransportFabricTransactionBatch, ITransportFabricEvent, ITransportFabricBlockBatch>
```

Разбирает блок с пакетной транзакцией. Помимо обычного разбора он раскрывает пакет: для каждого хэша из ответа догружает оригинальную транзакцию и её блок через `qscc`, чтобы восстановить полную картину.

```ts
export interface ITransportFabricTransactionBatch<U = any, V = any> extends ITransportFabricTransaction<U, V> {
    blockReceived: number;
}
```

Поле `blockReceived` — номер блока, в котором команда была принята, в отличие от блока, в котором она была исполнена в составе пакета.

| Метод | Назначение |
|---|---|
| `getBatchTransaction(block)` | найти пакетную транзакцию в блоке |
| `getSucceedBatchTransaction(block)` | найти успешную пакетную транзакцию |

### Фабрики

```ts
class TransportFabricFactory extends LoggerWrapper {
    public async get(uid: string): Promise<TransportFabric>;
}
```

Хранит транспорты по идентификатору и переиспользует их: если транспорт уже создан, но не подключён, `get` выполнит подключение. Настройки берутся из `TransportFabricConnectionSettingsFactory`, наследника фабрики настроек из `@hlf-core/api`.

Полезно, когда приложение работает с несколькими каналами или идентичностями одновременно.

## Примеры использования

### Отправка команды с ответом

```ts
let transport = new TransportFabric(logger, settings);
await transport.connect();

let user = await transport.sendListen(new UserGetCommand(uid));
```

### Подпись команды

```ts
await transport.sendListen(new UserAddCommand(dto), {
    userId: user.uid,
    signature: { value, algorithm, publicKey, nonce }
});
```

Опции команды расширены полями `userId` и `signature` — chaincode проверит подпись и `nonce` перед выполнением. Текущее значение `nonce` запрашивается командой `NonceGetCommand` из `@hlf-core/transport-common`.

### Обработка блоков

```ts
class MyTransport extends TransportFabric {
    protected async blockEventCallback(block: IFabricBlock): Promise<void> {
        let parser = new TransportFabricBlockParser();
        let item = await parser.parse(block);

        for (let transaction of item.transactions) {
            if (!TransportFabricBlockParser.isTransactionSucceed(transaction)) {
                continue;
            }
            console.log(transaction.request.name, transaction.requestId);
        }

        for (let event of item.events) {
            console.log(event.name, event.requestId, event.transactionValidationCode);
        }
    }
}
```

### Несколько подключений

```ts
let factory = new TransportFabricFactory(logger, settingsFactory);

let first = await factory.get('channel-one');
let second = await factory.get('channel-two');
```

## Важные особенности

**Завершение процесса при разрыве.** `isExitApplicationOnDisconnect` включён по умолчанию, поэтому `disconnect()` вызывает `process.exit(1)`. Учтите, что `destroy()` внутри вызывает `disconnect()` — уничтожение транспорта при включённой настройке завершит приложение. Если такое поведение нежелательно, задайте параметр явно:

```ts
new TransportFabric(logger, { ...settings, isExitApplicationOnDisconnect: false });
```

**Повторы подключения отключены по умолчанию.** `reconnectMaxAttempts` равен нулю, значит первая же неудачная попытка приводит к разрыву — а при включённой настройке выше и к завершению процесса. Для сервисов, стартующих одновременно с сетью, значение стоит задавать явно.

**Первый блок после подключения игнорируется в пакетном режиме.** `TransportFabricBatch` пропускает первый пришедший блок, чтобы не обработать повторно то, что уже было обработано до переподключения. Если в этом блоке содержались ответы на ожидающие команды, они не будут доставлены и команды завершатся по таймауту.

**Транспорт односторонний.** `eventRequestExecute` и `commandResponseExecute` выбрасывают исключение: отправить событие или ответ в сторону chaincode нельзя. Обратное направление — только через блоки.

**Опции команды изменяются при отправке.** `getCommandOptions` вызывает `clearDefaultOptions` для переданного объекта опций, то есть очищает его от значений по умолчанию. Не переиспользуйте один и тот же объект опций для нескольких команд, рассчитывая на его неизменность.

## Структура проекта

```
src/
├── TransportFabric.ts                         клиентский транспорт
├── ITransportFabricConnectionSettings.ts      настройки подключения
├── public-api.ts                              публичный API пакета
├── block/
│   ├── TransportFabricBlockParser.ts          разбор блоков, транзакций и событий
│   ├── ITransportFabricBlock.ts               структура разобранного блока
│   ├── ITransportFabricTransaction.ts         структура транзакции
│   ├── ITransportFabricTransactionChaincode.ts данные chaincode транзакции
│   └── ITransportFabricEvent.ts               структура события
├── batch/
│   ├── TransportFabricBatch.ts                транспорт с пакетной доставкой
│   └── block/
│       ├── TransportFabricBlockParserBatch.ts разбор блока с пакетом
│       ├── ITransportFabricBlockBatch.ts      структура блока с пакетом
│       └── ITransportFabricTransactionBatch.ts транзакция с номером блока приёма
└── factory/
    ├── TransportFabricFactory.ts              переиспользование транспортов
    └── TransportFabricConnectionSettingsFactory.ts  фабрика настроек
```

## Связанные пакеты

| Пакет | Роль |
|---|---|
| [@hlf-core/transport-common](https://www.npmjs.com/package/@hlf-core/transport-common) | общий протокол: конверты запроса и ответа, опции с подписью |
| [@hlf-core/transport-chaincode](https://www.npmjs.com/package/@hlf-core/transport-chaincode) | сторона chaincode: приём команд, проверка подписи |
| [@hlf-core/api](https://www.npmjs.com/package/@hlf-core/api) | клиент Fabric: подключение, контракты, запросы к qscc |

## Лицензия

ISC © Renat Gubaev

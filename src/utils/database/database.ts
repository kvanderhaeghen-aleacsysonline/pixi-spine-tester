// src/addItem.ts
import { SpineObject } from "../../models/spineObject";
import localforage from 'localforage'

export interface StorageData {
    atlas: string;
    animation: string;
    image: string;
}

export class DatabaseService {
    private indexedDB?: LocalForage;

    public init(): void {
        this.indexedDB = localforage.createInstance({
            name: 'spineCache',
        });
    }

    public async addItem(name: string, data: StorageData): Promise<void> {
        this.indexedDB?.setItem<StorageData>(name, data);
    }

    public async getItems(): Promise<SpineObject[]> {
        const items: SpineObject[] = [];
        const keys = await this.indexedDB!.keys();
        const length = keys.length ?? 0;
        for (let i = 0; i < length; i++) {
            await this.getItem(keys[i]).then((data) => {
                items.push(data);
            });
        }
        return items;
    }

    public async getItem(name: string): Promise<SpineObject> {
        const item = await this.indexedDB?.getItem<StorageData>(name).catch(function (err) {
            console.log("Error getting item:", err);
        });
        return {
            name: name,
            isBase64: true,
            atlasPath: item?.atlas,
            jsonPath: item?.animation,
            texturePath: item?.image
        };
    }

    public async removeAll(): Promise<void> {
        this.indexedDB?.clear()
        console.log("All items removed.");
    }

    public async removeItem(name: string) {
        this.indexedDB?.removeItem(name)
        console.log("Item '" + name + "' removed.");
    }
}


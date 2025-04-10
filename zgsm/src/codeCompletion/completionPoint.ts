/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { CompletionAcception, CompletionCorrection, CompletionDocumentInformation, CompletionPrompt } from "./completionDataInterface";
import { Position, TextDocument } from 'vscode';

/**
 * Calculate the primary key based on the editing position (this primary key serves as the unique identifier for the completion point).
 */
export function calcKey(fpath: string, line: number, column: number): string {
    //  test.py@12:1
    return fpath + "@" + line + ":" + column;
}

//
// The main time points in the code completion lifecycle:
// Content generation phase: [Code completion point creation] --Timed--> [Code completion RPC starts] --> Request --> Obtain result --> [Code completion RPC ends]
// Result processing phase: [Code completion RPC ends] --User processes the result--> [Accept/Reject]
// Content correction phase: [Accept/Reject] --> Correct the code --> [Obtain the user's corrected content] --> Report the result --> [Code completion point destruction]
//
/**
 * Code completion point.
 * Records the completion logic and related information that occurs at a code position.
 */
export class CompletionPoint {
    // The unique ID of the completion point.
    public readonly id: string = "";
    // The way to trigger completion: auto, manual.
    public readonly triggerMode: string = "";
    // Information about the document where the completion point is located.
    public readonly doc: CompletionDocumentInformation;
    // The position of the cursor.
    public readonly pos: Position;
    // The code before the cursor on the current line.
    public readonly linePrefix: string = "";
    // The code after the cursor on the current line.
    public readonly lineSuffix: string = "";
    // All the code before the cursor.
    public readonly prefix: string = "";
    // All the code after the cursor.
    public readonly suffix: string = "";
    // The creation time of the code completion point.
    public readonly createTime: number = 0;
    // The start time of code completion.
    private startTime: number = 0;
    // The end time of code completion.
    private endTime: number = 0;
    // The time when the user processes the completion result.
    private handleTime: number = 0;
    // The acceptance status of the completion result.
    private acception: CompletionAcception = CompletionAcception.None;
    // The obtained code completion content.
    private content: string = "";
    // The actual code corrected by the user.
    private actualCode: string = "";
    // The type of the user's behavior in correcting the code: none, changed, unchanged.
    private correction: CompletionCorrection = CompletionCorrection.None;

    constructor(id: string, docInfo: CompletionDocumentInformation, pos: Position,
        prompt: CompletionPrompt, triggerMode: string, createTime: number) {
        this.id = id;
        this.doc = docInfo;
        this.pos = pos;
        this.linePrefix = prompt.cursor_line_prefix;
        this.lineSuffix = prompt.cursor_line_suffix;
        this.prefix = prompt.prefix;
        this.suffix = prompt.suffix;
        this.triggerMode = triggerMode;
        this.createTime = createTime;
    }

    /**
     * Get the primary key of the completion point.
     */
    public getKey(): string {
        return calcKey(this.doc.fpath, this.pos.line, this.pos.character);
    }
    /**
     * Get the completion prompt.
     */
    public getPrompt(): CompletionPrompt {
        return {
            prefix: this.prefix,
            suffix: this.suffix,
            cursor_line_prefix: this.linePrefix,
            cursor_line_suffix: this.lineSuffix,
        }
    }

    public getContent(): string {
        return this.content;
    }
    public getActualCode(): string {
        return this.actualCode;
    }
    public getStartTime(): number {
        return this.startTime;
    }
    public getEndTime(): number {
        return this.endTime;
    }
    public getHandleTime(): number {
        return this.handleTime;
    }
    public getAcception(): CompletionAcception {
        return this.acception;
    }
    public getCorrection(): CompletionCorrection {
        return this.correction;
    }
    /**
     * Determine whether two completion points are strictly the same, i.e., the position remains unchanged and the leading code has not changed.
     */
    public isStrictSamePosition(other: CompletionPoint): boolean {
        return this.isSamePosition(other) &&
            this.linePrefix === other.linePrefix &&
            this.lineSuffix === other.lineSuffix;
    }
    /**
     * Determine whether they are at the same position.
     */
    public isSamePosition(other: CompletionPoint): boolean {
        return this.doc.fpath === other.doc.fpath &&
            this.pos.line === other.pos.line &&
            this.pos.character === other.pos.character;
    }
    /**
     * Determine whether they are on the same line.
     */
    public isSameLine(other: CompletionPoint): boolean {
        return this.doc.fpath === other.doc.fpath && this.pos.line === other.pos.line;
    }
    /**
     * Determine whether they are in the same document and at the same position.
     */
    public isSameAsDoc(document: TextDocument, pos: Position): boolean {
        return this.doc.fpath === document.uri.fsPath && this.pos.isEqual(pos);
    }
    /**
     * The completion point has entered the final state and can make a final statement.
     */
    public isFinished(): boolean {
        if (this.acception === CompletionAcception.None)
            return false;
        if (this.acception === CompletionAcception.Canceled)
            return true;
        return this.correction !== CompletionCorrection.None;
    }
    /**
     * Submit the completion point.
     */
    public submit() {
        this.startTime = Date.now();
    }
    /**
     * Cancel the completion point.
     */
    public cancel() {
        this.acception = CompletionAcception.Canceled;
        this.endTime = Date.now();
    }
    /**
     * Set the obtained completion result, which comes from LLM generation or other sources.
     */
    public fetched(content: string) {
        this.content = content;
        this.endTime = Date.now();
    }
    /**
     * Accept the completion content.
     */
    public accept() {
        this.handleTime = Date.now();
        this.acception = CompletionAcception.Accepted;
    }
    /**
     * Reject the completion content.
     */
    public reject() {
        this.handleTime = Date.now();
        this.acception = CompletionAcception.Rejected;
    }
    /**
     * The user has changed the completion content.
     */
    public changed(actualCode: string) {
        this.actualCode = actualCode;
        this.correction = CompletionCorrection.Changed;
    }
    /**
     * Later verification shows that the user fully accepts the completion content.
     */
    public unchanged() {
        this.correction = CompletionCorrection.Unchanged;
    }
}
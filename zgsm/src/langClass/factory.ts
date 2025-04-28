/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { LangName, BaseLangClass } from "./base"
import { CLangClass } from "./c"
import { CppLangClass } from "./cpp"
import { GoLangClass } from "./go"
import { PythonLangClass } from "./python"
import { LangClass } from "./LangClass"

/**
 * Retrieve the language class based on the language name
 * Languages not specified will be handled using the BaseLangClass for general processing
 */
export function getLanguageClass(language: string): LangClass {
	switch (language) {
		case LangName.CPP:
			return new CppLangClass()
		case LangName.C:
			return new CLangClass()
		case LangName.GO:
			return new GoLangClass()
		case LangName.PYTHON:
			return new PythonLangClass()
		default:
			return new BaseLangClass(language)
	}
}

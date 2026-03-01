interface Obj {
  [key: string]: any
}

export abstract class IUseCase<T extends Obj = any, TRes = any> {
  abstract execute(params: T): Promise<TRes>

  async run(params: T): Promise<{ result: TRes }> {
    const result = await this.execute(params)
    return { result }
  }
}

const getPort = jest.fn(async () => 12345)
getPort.portNumbers = { from: 10000, to: 20000 }
module.exports = getPort
